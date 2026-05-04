/**
 * WMS Web Stack — VPC + RDS PostgreSQL (Free Tier) + SSM Parameters + Budget
 *
 * Architecture:
 *   - VPC with 2 AZ, public subnets only (no NAT = $0)
 *   - RDS db.t4g.micro PostgreSQL 16, publicly accessible with restricted SG
 *   - SSM Parameter Store for DATABASE_URL and NEXTAUTH_SECRET
 *   - AWS Budget alert at configured threshold
 *
 * RDS is publicly accessible so the office PC can connect directly.
 * Security Group restricts access to:
 *   1. Office IP (officeIpCidr from config)
 *   2. Future Lambda SG (added in Phase 4)
 */
const { Stack, RemovalPolicy, CfnOutput, Duration, Fn, Size } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const rds = require("aws-cdk-lib/aws-rds");
const ssm = require("aws-cdk-lib/aws-ssm");
const budgets = require("aws-cdk-lib/aws-budgets");
const secretsmanager = require("aws-cdk-lib/aws-secretsmanager");
const s3 = require("aws-cdk-lib/aws-s3");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const lambda = require("aws-cdk-lib/aws-lambda");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const iam = require("aws-cdk-lib/aws-iam");
const scheduler = require("aws-cdk-lib/aws-scheduler");
const path = require("node:path");
const fs = require("node:fs");

function parseHourMinute(timeText, label) {
  const raw = typeof timeText === "string" ? timeText.trim() : "";
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) {
    throw new Error(`Invalid ${label} time "${timeText}". Expected HH:mm.`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

class WmsWebStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const config = props.webConfig;
    const prefix = config.namePrefix;
    const enableWebRuntime = config.enableWebRuntime !== false;
    const serverInVpc = config.serverInVpc !== false;

    // ─── VPC ──────────────────────────────────────────────────────────
    // Public-only subnets (no NAT Gateway = $0).
    // RDS is in public subnets with restricted SG (publicly accessible).
    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${prefix}-vpc`,
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ─── Security Group for RDS ───────────────────────────────────────
    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      securityGroupName: `${prefix}-rds-sg`,
      description: "Allow PostgreSQL access from office IP and future Lambda",
      allowAllOutbound: false,
    });

    const lambdaSecurityGroup =
      enableWebRuntime && serverInVpc
        ? new ec2.SecurityGroup(this, "LambdaSecurityGroup", {
            vpc,
            securityGroupName: `${prefix}-lambda-sg`,
            description: "Allow WMS Lambdas to reach PostgreSQL and VPC endpoints",
            allowAllOutbound: true,
          })
        : undefined;

    // Allow from office IP
    if (config.officeIpCidr && config.officeIpCidr !== "0.0.0.0/0") {
      dbSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(config.officeIpCidr),
        ec2.Port.tcp(5432),
        "PostgreSQL from office"
      );
    } else {
      // Dev mode: allow from anywhere (restrict in prod!)
      dbSecurityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(5432),
        "PostgreSQL from anywhere (dev only - restrict in prod)"
      );
    }

    if (lambdaSecurityGroup) {
      dbSecurityGroup.addIngressRule(
        lambdaSecurityGroup,
        ec2.Port.tcp(5432),
        "PostgreSQL from WMS Lambda security group"
      );
    }

    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PUBLIC }],
    });

    // ─── RDS PostgreSQL ───────────────────────────────────────────────
    // Free Tier: db.t4g.micro, 20GB gp2, single-AZ, no Multi-AZ
    const dbCredentials = new secretsmanager.Secret(this, "DbCredentials", {
      secretName: `${prefix}/db-credentials`,
      description: "RDS PostgreSQL credentials for WMS",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: config.dbUsername }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 24,
      },
    });

    const dbInstance = new rds.DatabaseInstance(this, "Database", {
      instanceIdentifier: `${prefix}-pg`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [dbSecurityGroup],
      databaseName: config.dbName,
      credentials: rds.Credentials.fromSecret(dbCredentials),
      allocatedStorage: config.dbAllocatedStorageGb,
      storageType: rds.StorageType.GP2,
      multiAz: false,
      publiclyAccessible: config.rdsPubliclyAccessible !== false,
      autoMinorVersionUpgrade: true,
      backupRetention: Duration.days(7),
      deletionProtection: config.environment === "prod",
      removalPolicy:
        config.environment === "prod"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      storageEncrypted: true,
    });

    // ─── SSM Parameters ───────────────────────────────────────────────
    // DATABASE_URL is built from the secret + endpoint at deploy time.
    // Lambda and the office PC read this to connect.
    new ssm.StringParameter(this, "SsmDbEndpoint", {
      parameterName: `/${prefix}/db-endpoint`,
      stringValue: dbInstance.dbInstanceEndpointAddress,
      description: "RDS endpoint hostname",
    });

    new ssm.StringParameter(this, "SsmDbPort", {
      parameterName: `/${prefix}/db-port`,
      stringValue: dbInstance.dbInstanceEndpointPort,
      description: "RDS endpoint port",
    });

    new ssm.StringParameter(this, "SsmDbName", {
      parameterName: `/${prefix}/db-name`,
      stringValue: config.dbName,
      description: "Database name",
    });

    new ssm.StringParameter(this, "SsmDbSecretArn", {
      parameterName: `/${prefix}/db-secret-arn`,
      stringValue: dbCredentials.secretArn,
      description: "ARN of the Secrets Manager secret with DB credentials",
    });

    // NextAuth secret — generate a random one
    const nextAuthSecret = new secretsmanager.Secret(this, "NextAuthSecret", {
      secretName: `${prefix}/nextauth-secret`,
      description: "NextAuth JWT signing secret",
      generateSecretString: {
        excludePunctuation: false,
        passwordLength: 48,
      },
    });

    new ssm.StringParameter(this, "SsmNextAuthSecretArn", {
      parameterName: `/${prefix}/nextauth-secret-arn`,
      stringValue: nextAuthSecret.secretArn,
      description: "ARN of the NextAuth secret",
    });

    // ─── Budget Alert ─────────────────────────────────────────────────
    if (config.budgetLimitUsd) {
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: `${prefix}-monthly-limit`,
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: {
            amount: config.budgetLimitUsd,
            unit: "USD",
          },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              comparisonOperator: "GREATER_THAN",
              notificationType: "ACTUAL",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [
              {
                subscriptionType: "SNS",
                address: `arn:aws:sns:${this.region}:${this.account}:${prefix}-budget-alerts`,
              },
            ],
          },
        ],
      });
    }

    // ─── Outputs (RDS) ─────────────────────────────────────────────
    new CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      description: "VPC ID",
    });

    new CfnOutput(this, "RdsEndpoint", {
      value: dbInstance.dbInstanceEndpointAddress,
      description: "RDS PostgreSQL endpoint",
    });

    new CfnOutput(this, "RdsPort", {
      value: dbInstance.dbInstanceEndpointPort,
      description: "RDS PostgreSQL port",
    });

    new CfnOutput(this, "DbSecretArn", {
      value: dbCredentials.secretArn,
      description: "Secrets Manager ARN for DB credentials",
    });

    new CfnOutput(this, "DbSecurityGroupId", {
      value: dbSecurityGroup.securityGroupId,
      description: "Security Group ID for RDS",
    });

    new CfnOutput(this, "NextAuthSecretArn", {
      value: nextAuthSecret.secretArn,
      description: "Secrets Manager ARN for NextAuth secret",
    });

    // ─── OpenNext / Lambda / CloudFront ───────────────────────────────
    if (!enableWebRuntime) {
      console.log("INFO: Web runtime disabled by config (enableWebRuntime=false).");
      this.dbSecurityGroup = dbSecurityGroup;
      this.vpc = vpc;
      this.dbInstance = dbInstance;
      this.dbCredentials = dbCredentials;
      return;
    }

    // Only deploy if the .open-next build output exists
    // projectRoot = repo root (infra/cdk/lib/../../..)
    const projectRoot = path.join(__dirname, "..", "..", "..");
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8")
    );
    const openNextPath = path.join(projectRoot, ".open-next");
    if (!fs.existsSync(openNextPath)) {
      console.log(
        "WARNING: .open-next/ not found - skipping Lambda/CloudFront. Run: npx @opennextjs/aws build"
      );
      this.dbSecurityGroup = dbSecurityGroup;
      this.vpc = vpc;
      this.dbInstance = dbInstance;
      this.dbCredentials = dbCredentials;
      return;
    }

    const openNextOutput = JSON.parse(
      fs.readFileSync(path.join(openNextPath, "open-next.output.json"), "utf-8")
    );

    // ─── S3 Bucket for static assets ─────────────────────────────────
    const assetsBucket = new s3.Bucket(this, "AssetsBucket", {
      bucketName: `${prefix}-assets`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
    });

    // Upload static assets from .open-next/assets & cache
    const s3OriginMeta = openNextOutput.origins.s3;
    for (const copy of s3OriginMeta.copy) {
      new s3deploy.BucketDeployment(this, `AssetsDeploy-${copy.from.replace(/[^a-zA-Z0-9]/g, "")}`, {
        sources: [s3deploy.Source.asset(path.join(projectRoot, copy.from))],
        destinationBucket: assetsBucket,
        destinationKeyPrefix: copy.to,
        prune: false,
        // Assets can be large (product-images ~360MB) — increase Lambda resources
        memoryLimit: 1024,
        ephemeralStorageSize: Size.gibibytes(2),
      });
    }

    // ─── Build DATABASE_URL from Secrets Manager ──────────────────────
    const dbUrl = Fn.join("", [
      "postgresql://",
      config.dbUsername,
      ":",
      dbCredentials.secretValueFromJson("password").unsafeUnwrap(),
      "@",
      dbInstance.dbInstanceEndpointAddress,
      ":",
      dbInstance.dbInstanceEndpointPort,
      "/",
      config.dbName,
      "?schema=public&connection_limit=2&pool_timeout=5",
    ]);
    const serverReservedConcurrency =
      Number.isFinite(Number(config.serverReservedConcurrency)) &&
      Number(config.serverReservedConcurrency) > 0
        ? Number(config.serverReservedConcurrency)
        : undefined;
    const webLambdaNetworkProps = serverInVpc
      ? {
          vpc,
          vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
          allowPublicSubnet: true,
          securityGroups: lambdaSecurityGroup ? [lambdaSecurityGroup] : undefined,
        }
      : {};

    // ─── Server Lambda ────────────────────────────────────────────────
    const serverFn = new lambda.Function(this, "ServerFunction", {
      functionName: `${prefix}-server`,
      description: "Next.js server (OpenNext)",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: openNextOutput.origins.default.handler,
      code: lambda.Code.fromAsset(path.join(projectRoot, openNextOutput.origins.default.bundle)),
      memorySize: 1536,
      ...(serverReservedConcurrency
        ? { reservedConcurrentExecutions: serverReservedConcurrency }
        : {}),
      timeout: Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      ...webLambdaNetworkProps,
      environment: {
        NODE_ENV: "production",
        APP_VERSION: packageJson.version || "unknown",
        AUTH_TRUST_HOST: "true",
        DATABASE_URL: dbUrl,
        AUTH_SECRET: nextAuthSecret.secretValue.unsafeUnwrap(),
        NEXTAUTH_URL: "https://placeholder.cloudfront.net", // Updated post-deploy (circular dep with CF)
        NEXT_PUBLIC_APP_BASE_URL: "https://placeholder.cloudfront.net", // Updated post-deploy
        CACHE_BUCKET_NAME: assetsBucket.bucketName,
        CACHE_BUCKET_KEY_PREFIX: "_cache",
        CACHE_BUCKET_REGION: this.region,
        OPEN_NEXT_ORIGIN: "default",
        WMS_DISABLE_SYNC_EVENTS_IN_WEB: "true",
        PERF_DEBUG_LOGS: config.environment === "dev" ? "true" : "false",
      },
    });

    assetsBucket.grantReadWrite(serverFn);
    dbCredentials.grantRead(serverFn);
    nextAuthSecret.grantRead(serverFn);

    const serverUrl = serverFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: openNextOutput.origins.default.streaming
        ? lambda.InvokeMode.RESPONSE_STREAM
        : lambda.InvokeMode.BUFFERED,
    });

    // ─── Image Optimization Lambda ────────────────────────────────────
    const imageOriginMeta = openNextOutput.origins.imageOptimizer;
    const imageFn = new lambda.Function(this, "ImageFunction", {
      functionName: `${prefix}-image`,
      description: "Next.js image optimization (OpenNext)",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: imageOriginMeta.handler,
      code: lambda.Code.fromAsset(path.join(projectRoot, imageOriginMeta.bundle)),
      memorySize: 512,
      timeout: Duration.seconds(25),
      ...webLambdaNetworkProps,
      environment: {
        BUCKET_NAME: assetsBucket.bucketName,
        BUCKET_KEY_PREFIX: "_assets",
        OPEN_NEXT_ORIGIN: "imageOptimizer",
      },
    });

    assetsBucket.grantRead(imageFn);

    const imageUrl = imageFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    // ─── CloudFront Distribution ──────────────────────────────────────
    const cfFunction = new cloudfront.Function(this, "CfHostForward", {
      functionName: `${prefix}-host-forward`,
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          request.headers["x-forwarded-host"] = request.headers.host;
          return request;
        }
      `),
    });

    const fnAssociations = [
      {
        function: cfFunction,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      },
    ];

    const serverCachePolicy = new cloudfront.CachePolicy(this, "ServerCachePolicy", {
      cachePolicyName: `${prefix}-server`,
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        "accept",
        "accept-encoding",
        "rsc",
        "next-router-prefetch",
        "next-router-state-tree",
        "next-url",
        "x-prerender-revalidate"
      ),
      cookieBehavior: cloudfront.CacheCookieBehavior.all(),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
      minTtl: Duration.seconds(0),
    });

    const serverOrigin = new origins.HttpOrigin(
      Fn.parseDomainName(serverUrl.url)
    );
    const imageOrigin = new origins.HttpOrigin(
      Fn.parseDomainName(imageUrl.url)
    );
    const s3CloudfrontOrigin = origins.S3BucketOrigin.withOriginAccessControl(assetsBucket, {
      originPath: s3OriginMeta.originPath || undefined,
    });

    const additionalBehaviors = {};
    for (const behavior of openNextOutput.behaviors) {
      if (behavior.pattern === "*") continue;
      let origin;
      if (behavior.origin === "s3") {
        origin = s3CloudfrontOrigin;
      } else if (behavior.origin === "imageOptimizer") {
        origin = imageOrigin;
      } else {
        origin = serverOrigin;
      }
      additionalBehaviors[behavior.pattern] = {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: behavior.origin === "s3"
          ? cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS
          : cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: behavior.origin === "s3"
          ? cloudfront.CachePolicy.CACHING_OPTIMIZED
          : serverCachePolicy,
        originRequestPolicy: behavior.origin === "s3"
          ? undefined
          : cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: behavior.origin === "s3" ? [] : fnAssociations,
      };
    }

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: serverOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: serverCachePolicy,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: fnAssociations,
      },
      additionalBehaviors,
    });

    // ─── Warmer Lambda + schedule (DEV performance tuning) ───────────
    const warmerFn = new lambda.Function(this, "ServerWarmerFunction", {
      functionName: `${prefix}-warmer`,
      description: "Warm ping for web server Lambda",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
const https = require("node:https");

exports.handler = async () => {
  const started = Date.now();
  const baseUrl = process.env.WARM_TARGET_BASE_URL;
  const target = baseUrl ? \`\${baseUrl}/api/health?warm=1\` : null;
  if (!target) {
    console.log(JSON.stringify({ ok: false, reason: "missing_target", durationMs: Date.now() - started }));
    return { ok: false, reason: "missing_target" };
  }

  try {
    await new Promise((resolve, reject) => {
      const req = https.get(target, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        reject(new Error(\`status_\${res.statusCode ?? "unknown"}\`));
      });
      req.on("error", reject);
      req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    });
    const durationMs = Date.now() - started;
    console.log(JSON.stringify({ ok: true, durationMs }));
    return { ok: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ ok: false, error: message, durationMs }));
    return { ok: false, error: message, durationMs };
  }
};
      `),
      memorySize: 128,
      timeout: Duration.seconds(10),
      environment: {
        WARM_TARGET_BASE_URL: `https://${distribution.distributionDomainName}`,
      },
    });

    const warmerRuleName = `${prefix}-warmer-every-5m`;
    new events.Rule(this, "ServerWarmerRule", {
      ruleName: `${prefix}-warmer-every-5m`,
      description: "Keep server lambda warm every 5 minutes",
      schedule: events.Schedule.rate(Duration.minutes(5)),
      targets: [new targets.LambdaFunction(warmerFn)],
    });

    const scheduleControl = config.scheduleControl || {};
    if (config.environment === "dev" && scheduleControl.enabled) {
      const timezone = scheduleControl.timezone || "America/Mexico_City";
      const weekdaysStart = parseHourMinute(scheduleControl.weekdaysStart || "08:00", "scheduleControl.weekdaysStart");
      const weekdaysStop = parseHourMinute(scheduleControl.weekdaysStop || "20:00", "scheduleControl.weekdaysStop");
      const saturdayStart = parseHourMinute(scheduleControl.saturdayStart || "08:00", "scheduleControl.saturdayStart");
      const saturdayStop = parseHourMinute(scheduleControl.saturdayStop || "16:00", "scheduleControl.saturdayStop");
      const manageRds = scheduleControl.manageRds !== false;
      const manageLambdas = scheduleControl.manageLambdas !== false;
      const manageWarmer = scheduleControl.manageWarmer !== false;

      const schedulerControllerCode = `
const { RDSClient, StartDBInstanceCommand, StopDBInstanceCommand } = require("@aws-sdk/client-rds");
const { LambdaClient, PutFunctionConcurrencyCommand, DeleteFunctionConcurrencyCommand } = require("@aws-sdk/client-lambda");
const { EventBridgeClient, EnableRuleCommand, DisableRuleCommand } = require("@aws-sdk/client-eventbridge");

const rdsClient = new RDSClient({});
const lambdaClient = new LambdaClient({});
const eventBridgeClient = new EventBridgeClient({});

function bool(v) { return String(v).toLowerCase() === "true"; }

async function setLambdaConcurrency(functionName, reservedConcurrentExecutions) {
  if (reservedConcurrentExecutions === null) {
    await lambdaClient.send(new DeleteFunctionConcurrencyCommand({ FunctionName: functionName }));
    return { functionName, action: "delete_concurrency_limit" };
  }
  await lambdaClient.send(new PutFunctionConcurrencyCommand({ FunctionName: functionName, ReservedConcurrentExecutions: reservedConcurrentExecutions }));
  return { functionName, action: "set_concurrency_limit", reservedConcurrentExecutions };
}

exports.handler = async () => {
  const mode = process.env.MODE;
  const manageRds = bool(process.env.MANAGE_RDS);
  const manageLambdas = bool(process.env.MANAGE_LAMBDAS);
  const manageWarmer = bool(process.env.MANAGE_WARMER);
  const summary = { mode, manageRds, manageLambdas, manageWarmer, steps: [] };

  if (manageRds) {
    const dbInstanceIdentifier = process.env.DB_INSTANCE_IDENTIFIER;
    if (mode === "start") {
      await rdsClient.send(new StartDBInstanceCommand({ DBInstanceIdentifier: dbInstanceIdentifier }));
      summary.steps.push({ resource: "rds", action: "start", dbInstanceIdentifier });
    } else {
      await rdsClient.send(new StopDBInstanceCommand({ DBInstanceIdentifier: dbInstanceIdentifier }));
      summary.steps.push({ resource: "rds", action: "stop", dbInstanceIdentifier });
    }
  }

  if (manageLambdas) {
    const serverFunctionName = process.env.SERVER_FUNCTION_NAME;
    const imageFunctionName = process.env.IMAGE_FUNCTION_NAME;
    if (mode === "start") {
      summary.steps.push(await setLambdaConcurrency(serverFunctionName, null));
      summary.steps.push(await setLambdaConcurrency(imageFunctionName, null));
    } else {
      summary.steps.push(await setLambdaConcurrency(serverFunctionName, 0));
      summary.steps.push(await setLambdaConcurrency(imageFunctionName, 0));
    }
  }

  if (manageWarmer) {
    const warmerRuleName = process.env.WARMER_RULE_NAME;
    if (mode === "start") {
      await eventBridgeClient.send(new EnableRuleCommand({ Name: warmerRuleName }));
      summary.steps.push({ resource: "eventbridge_rule", action: "enable", name: warmerRuleName });
    } else {
      await eventBridgeClient.send(new DisableRuleCommand({ Name: warmerRuleName }));
      summary.steps.push({ resource: "eventbridge_rule", action: "disable", name: warmerRuleName });
    }
  }

  console.log(JSON.stringify({ ok: true, ...summary }));
  return { ok: true, ...summary };
};
      `;

      const startDevServicesFn = new lambda.Function(this, "StartDevServicesFunction", {
        functionName: "start-dev-services",
        description: "Start DEV services on schedule (RDS, web runtime, warmer)",
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: "index.handler",
        code: lambda.Code.fromInline(schedulerControllerCode),
        timeout: Duration.seconds(30),
        memorySize: 256,
        environment: {
          MODE: "start",
          DB_INSTANCE_IDENTIFIER: `${prefix}-pg`,
          SERVER_FUNCTION_NAME: `${prefix}-server`,
          IMAGE_FUNCTION_NAME: `${prefix}-image`,
          WARMER_RULE_NAME: warmerRuleName,
          MANAGE_RDS: String(manageRds),
          MANAGE_LAMBDAS: String(manageLambdas),
          MANAGE_WARMER: String(manageWarmer),
        },
      });

      const stopDevServicesFn = new lambda.Function(this, "StopDevServicesFunction", {
        functionName: "stop-dev-services",
        description: "Stop DEV services on schedule (RDS, web runtime, warmer)",
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        handler: "index.handler",
        code: lambda.Code.fromInline(schedulerControllerCode),
        timeout: Duration.seconds(30),
        memorySize: 256,
        environment: {
          MODE: "stop",
          DB_INSTANCE_IDENTIFIER: `${prefix}-pg`,
          SERVER_FUNCTION_NAME: `${prefix}-server`,
          IMAGE_FUNCTION_NAME: `${prefix}-image`,
          WARMER_RULE_NAME: warmerRuleName,
          MANAGE_RDS: String(manageRds),
          MANAGE_LAMBDAS: String(manageLambdas),
          MANAGE_WARMER: String(manageWarmer),
        },
      });

      const startPolicy = new iam.PolicyStatement({
        actions: ["rds:StartDBInstance", "rds:StopDBInstance"],
        resources: ["*"],
      });
      const lambdaPolicy = new iam.PolicyStatement({
        actions: ["lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency"],
        resources: ["*"],
      });
      const warmerPolicy = new iam.PolicyStatement({
        actions: ["events:EnableRule", "events:DisableRule"],
        resources: ["*"],
      });

      startDevServicesFn.addToRolePolicy(startPolicy);
      stopDevServicesFn.addToRolePolicy(startPolicy);
      startDevServicesFn.addToRolePolicy(lambdaPolicy);
      stopDevServicesFn.addToRolePolicy(lambdaPolicy);
      startDevServicesFn.addToRolePolicy(warmerPolicy);
      stopDevServicesFn.addToRolePolicy(warmerPolicy);

      const schedulerInvokeRole = new iam.Role(this, "DevScheduleInvokeRole", {
        assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
        description: "Invoke start/stop DEV scheduler Lambdas",
      });
      schedulerInvokeRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ["lambda:InvokeFunction"],
          resources: [startDevServicesFn.functionArn, stopDevServicesFn.functionArn],
        })
      );

      const mkRule = (id, name, cronExpr, targetFn) => {
        new scheduler.CfnSchedule(this, id, {
          name,
          description: `Schedule control (${cronExpr})`,
          groupName: "default",
          state: "ENABLED",
          flexibleTimeWindow: { mode: "OFF" },
          scheduleExpression: cronExpr,
          scheduleExpressionTimezone: timezone,
          target: {
            arn: targetFn.functionArn,
            roleArn: schedulerInvokeRole.roleArn,
          },
        });
      };

      mkRule(
        "DevWeekdaysStartRule",
        `${prefix}-weekday-start`,
        `cron(${weekdaysStart.minute} ${weekdaysStart.hour} ? * MON-FRI *)`,
        startDevServicesFn
      );
      mkRule(
        "DevWeekdaysStopRule",
        `${prefix}-weekday-stop`,
        `cron(${weekdaysStop.minute} ${weekdaysStop.hour} ? * MON-FRI *)`,
        stopDevServicesFn
      );
      mkRule(
        "DevSaturdayStartRule",
        `${prefix}-saturday-start`,
        `cron(${saturdayStart.minute} ${saturdayStart.hour} ? * SAT *)`,
        startDevServicesFn
      );
      mkRule(
        "DevSaturdayStopRule",
        `${prefix}-saturday-stop`,
        `cron(${saturdayStop.minute} ${saturdayStop.hour} ? * SAT *)`,
        stopDevServicesFn
      );

      new cloudwatch.Alarm(this, "StartDevServicesErrorsAlarm", {
        alarmDescription: "Alarm when start-dev-services Lambda returns errors",
        metric: startDevServicesFn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      new cloudwatch.Alarm(this, "StopDevServicesErrorsAlarm", {
        alarmDescription: "Alarm when stop-dev-services Lambda returns errors",
        metric: stopDevServicesFn.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    // ─── Outputs (Lambda / CloudFront) ────────────────────────────────
    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront URL for remote access",
    });

    new CfnOutput(this, "ServerFunctionUrl", {
      value: serverUrl.url,
      description: "Server Lambda Function URL",
    });

    new CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
      description: "CloudFront Distribution ID",
    });

    // Expose for potential inter-stack references
    this.dbSecurityGroup = dbSecurityGroup;
    this.vpc = vpc;
    this.dbInstance = dbInstance;
    this.dbCredentials = dbCredentials;
  }
}

module.exports = { WmsWebStack };
