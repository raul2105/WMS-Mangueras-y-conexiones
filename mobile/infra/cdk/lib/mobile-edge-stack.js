const path = require("node:path");
const cdk = require("aws-cdk-lib");
const { Stack, Duration, RemovalPolicy } = cdk;
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigwv2 = require("aws-cdk-lib/aws-apigatewayv2");
const integrations = require("aws-cdk-lib/aws-apigatewayv2-integrations");
const authorizers = require("aws-cdk-lib/aws-apigatewayv2-authorizers");
const logs = require("aws-cdk-lib/aws-logs");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const sqs = require("aws-cdk-lib/aws-sqs");

function resolveRetention(retention) {
  const map = {
    SEVEN_DAYS: logs.RetentionDays.SEVEN_DAYS,
    TWO_WEEKS: logs.RetentionDays.TWO_WEEKS,
    ONE_MONTH: logs.RetentionDays.ONE_MONTH,
  };
  return map[retention] || logs.RetentionDays.ONE_WEEK;
}

class MobileEdgeStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const config = props.mobileConfig || {};
    const prefix = config.namePrefix || "rigentec-wms-mobile-dev";
    const retention = resolveRetention(config.logRetentionDays);
    const lambdaCodePath = path.resolve(__dirname, "../../../functions");

    const webBucket = new s3.Bucket(this, "MobileWebBucket", {
      bucketName: `${prefix}-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const distribution = new cloudfront.Distribution(this, "MobileWebDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(1) },
      ],
    });

    const userPool = new cognito.UserPool(this, "MobileUserPool", {
      userPoolName: `${prefix}-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      customAttributes: {
        role_code: new cognito.StringAttribute({ mutable: true }),
        role_codes: new cognito.StringAttribute({ mutable: true }),
        preferred_wh_code: new cognito.StringAttribute({ mutable: true }),
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPoolClient = new cognito.UserPoolClient(this, "MobileUserPoolClient", {
      userPool,
      userPoolClientName: `${prefix}-web-client`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: config.callbackUrls,
        logoutUrls: config.logoutUrls,
      },
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    const userPoolDomain = new cognito.UserPoolDomain(this, "MobileUserPoolDomain", {
      userPool,
      cognitoDomain: { domainPrefix: config.cognitoDomainPrefix },
    });

    const inventoryTable = new dynamodb.Table(this, "MobileInventoryTable", {
      tableName: `${prefix}-inventory`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "warehouseCode", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "searchKey", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    inventoryTable.addGlobalSecondaryIndex({
      indexName: "sku-index",
      partitionKey: { name: "warehouseCode", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "skuNormalized", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const catalogTable = new dynamodb.Table(this, "MobileCatalogTable", {
      tableName: `${prefix}-catalog`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "productId", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const salesRequestsTable = new dynamodb.Table(this, "MobileSalesRequestsTable", {
      tableName: `${prefix}-sales-requests`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "requestId", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const assemblyRequestsTable = new dynamodb.Table(this, "MobileAssemblyRequestsTable", {
      tableName: `${prefix}-assembly-requests`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "requestId", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const productDraftsTable = new dynamodb.Table(this, "MobileProductDraftsTable", {
      tableName: `${prefix}-product-drafts`,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "draftId", type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const integrationDlq = new sqs.Queue(this, "MobileIntegrationDlq", {
      queueName: `${prefix}-integration-dlq`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const integrationQueue = new sqs.Queue(this, "MobileIntegrationQueue", {
      queueName: `${prefix}-integration`,
      retentionPeriod: Duration.days(4),
      visibilityTimeout: Duration.seconds(60),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: integrationDlq,
        maxReceiveCount: 3,
      },
    });

    const commonEnvironment = {
      MOBILE_SERVICE_NAME: config.mobileServiceName || "wms-mobile-edge",
      MOBILE_AUTH_MODE: config.mobileAuthMode || "cognito",
      MOBILE_BUILD: config.mobileBuild || "dev",
      MOBILE_RELEASE_DATE: config.mobileReleaseDate || "2026-04-07",
      MOBILE_ENABLED: String(Boolean(config.flags?.mobile_enabled)),
      CATALOG_ENABLED: String(Boolean(config.flags?.catalog_enabled)),
      INVENTORY_SEARCH_ENABLED: String(Boolean(config.flags?.inventory_search_enabled)),
      SALES_REQUESTS_ENABLED: String(Boolean(config.flags?.sales_requests_enabled)),
      AVAILABILITY_ENABLED: String(Boolean(config.flags?.availability_enabled)),
      EQUIVALENCES_ENABLED: String(Boolean(config.flags?.equivalences_enabled)),
      ASSEMBLY_REQUESTS_ENABLED: String(Boolean(config.flags?.assembly_requests_enabled)),
      PRODUCT_DRAFTS_ENABLED: String(Boolean(config.flags?.product_drafts_enabled)),
      MOBILE_DDB_CATALOG_TABLE: catalogTable.tableName,
      MOBILE_DDB_INVENTORY_TABLE: inventoryTable.tableName,
      MOBILE_DDB_SALES_REQUESTS_TABLE: salesRequestsTable.tableName,
      MOBILE_DDB_ASSEMBLY_REQUESTS_TABLE: assemblyRequestsTable.tableName,
      MOBILE_DDB_PRODUCT_DRAFTS_TABLE: productDraftsTable.tableName,
      MOBILE_INTEGRATION_QUEUE_URL: integrationQueue.queueUrl,
      MOBILE_CORS_ALLOWED_ORIGIN: config.corsAllowedOrigins.join(","),
    };

    const createFunction = (idName, handlerName) =>
      new lambda.Function(this, idName, {
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: Duration.seconds(10),
        memorySize: 256,
        handler: `handlers/${handlerName}.handler`,
        code: lambda.Code.fromAsset(lambdaCodePath),
        environment: commonEnvironment,
      });

    const healthFn = createFunction("MobileHealthFn", "health");
    const versionFn = createFunction("MobileVersionFn", "version");
    const mePermissionsFn = createFunction("MobileMePermissionsFn", "me-permissions");
    const catalogListFn = createFunction("MobileCatalogListFn", "catalog-list");
    const catalogGetFn = createFunction("MobileCatalogGetFn", "catalog-get");
    const inventorySearchFn = createFunction("MobileInventorySearchFn", "inventory-search");
    const salesRequestListFn = createFunction("MobileSalesRequestListFn", "sales-request-list");
    const salesRequestGetFn = createFunction("MobileSalesRequestGetFn", "sales-request-get");
    const salesRequestCreateFn = createFunction("MobileSalesRequestCreateFn", "sales-request-create");
    const availabilityFn = createFunction("MobileAvailabilityFn", "availability");
    const equivalencesFn = createFunction("MobileEquivalencesFn", "equivalences");
    const assemblyRequestCreateFn = createFunction("MobileAssemblyRequestCreateFn", "assembly-request-create");
    const assemblyRequestGetFn = createFunction("MobileAssemblyRequestGetFn", "assembly-request-get");
    const productDraftCreateFn = createFunction("MobileProductDraftCreateFn", "product-draft-create");

    catalogTable.grantReadData(catalogListFn);
    catalogTable.grantReadData(catalogGetFn);
    inventoryTable.grantReadData(inventorySearchFn);
    catalogTable.grantReadData(availabilityFn);
    catalogTable.grantReadData(equivalencesFn);
    salesRequestsTable.grantReadData(salesRequestListFn);
    salesRequestsTable.grantReadData(salesRequestGetFn);
    salesRequestsTable.grantReadWriteData(salesRequestCreateFn);
    assemblyRequestsTable.grantReadWriteData(assemblyRequestCreateFn);
    assemblyRequestsTable.grantReadData(assemblyRequestGetFn);
    productDraftsTable.grantReadWriteData(productDraftCreateFn);
    integrationQueue.grantSendMessages(salesRequestCreateFn);
    integrationQueue.grantSendMessages(assemblyRequestCreateFn);
    integrationQueue.grantSendMessages(productDraftCreateFn);

    const accessLogs = new logs.LogGroup(this, "MobileApiLogs", {
      logGroupName: `/aws/apigateway/${prefix}-api`,
      retention,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const httpApi = new apigwv2.HttpApi(this, "MobileHttpApi", {
      apiName: `${prefix}-api`,
      createDefaultStage: true,
      corsPreflight: {
        allowOrigins: config.corsAllowedOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ["authorization", "content-type"],
      },
    });

    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer("MobileJwtAuthorizer", userPool.userPoolProviderUrl, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });

    const addRoute = (idName, route) => {
      const integration = new integrations.HttpLambdaIntegration(idName, route.lambdaFn);
      httpApi.addRoutes({
        path: route.path,
        methods: route.methods,
        integration,
        ...(route.privateRoute ? { authorizer: jwtAuthorizer } : {}),
      });
    };

    addRoute("HealthIntegration", {
      path: "/v1/mobile/health",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: healthFn,
      privateRoute: false,
    });

    addRoute("VersionIntegration", {
      path: "/v1/mobile/version",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: versionFn,
      privateRoute: false,
    });

    addRoute("MePermissionsIntegration", {
      path: "/v1/mobile/me/permissions",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: mePermissionsFn,
      privateRoute: true,
    });

    addRoute("InventorySearchIntegration", {
      path: "/v1/mobile/inventory/search",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: inventorySearchFn,
      privateRoute: true,
    });

    addRoute("CatalogListIntegration", {
      path: "/v1/mobile/catalog",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: catalogListFn,
      privateRoute: true,
    });

    addRoute("CatalogGetIntegration", {
      path: "/v1/mobile/catalog/{productId}",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: catalogGetFn,
      privateRoute: true,
    });

    addRoute("SalesRequestListIntegration", {
      path: "/v1/mobile/sales-requests",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: salesRequestListFn,
      privateRoute: true,
    });

    addRoute("SalesRequestCreateIntegration", {
      path: "/v1/mobile/sales-requests",
      methods: [apigwv2.HttpMethod.POST],
      lambdaFn: salesRequestCreateFn,
      privateRoute: true,
    });

    addRoute("SalesRequestGetIntegration", {
      path: "/v1/mobile/sales-requests/{id}",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: salesRequestGetFn,
      privateRoute: true,
    });

    addRoute("AvailabilityIntegration", {
      path: "/v1/mobile/availability",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: availabilityFn,
      privateRoute: true,
    });

    addRoute("EquivalencesIntegration", {
      path: "/v1/mobile/equivalences",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: equivalencesFn,
      privateRoute: true,
    });

    addRoute("AssemblyRequestCreateIntegration", {
      path: "/v1/mobile/assembly-requests",
      methods: [apigwv2.HttpMethod.POST],
      lambdaFn: assemblyRequestCreateFn,
      privateRoute: true,
    });

    addRoute("AssemblyRequestGetIntegration", {
      path: "/v1/mobile/assembly-requests/{requestId}",
      methods: [apigwv2.HttpMethod.GET],
      lambdaFn: assemblyRequestGetFn,
      privateRoute: true,
    });

    addRoute("ProductDraftCreateIntegration", {
      path: "/v1/mobile/product-drafts",
      methods: [apigwv2.HttpMethod.POST],
      lambdaFn: productDraftCreateFn,
      privateRoute: true,
    });

    const stage = httpApi.defaultStage;
    if (stage) {
      stage.node.addDependency(accessLogs);
      const cfnStage = stage.node.defaultChild;
      cfnStage.accessLogSettings = {
        destinationArn: accessLogs.logGroupArn,
        format: JSON.stringify({
          requestId: "$context.requestId",
          ip: "$context.identity.sourceIp",
          requestTime: "$context.requestTime",
          routeKey: "$context.routeKey",
          status: "$context.status",
          protocol: "$context.protocol",
          responseLength: "$context.responseLength",
        }),
      };
    }

    new cdk.CfnOutput(this, "MobileCloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, "MobileApiBaseUrl", {
      value: httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, "MobileUserPoolId", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "MobileUserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "MobileUserPoolDomainOutput", {
      value: userPoolDomain.domainName,
    });

    new cdk.CfnOutput(this, "MobileInventoryTableName", {
      value: inventoryTable.tableName,
    });

    new cdk.CfnOutput(this, "MobileCatalogTableName", {
      value: catalogTable.tableName,
    });

    new cdk.CfnOutput(this, "MobileSalesRequestsTableName", {
      value: salesRequestsTable.tableName,
    });

    new cdk.CfnOutput(this, "MobileAssemblyRequestsTableName", {
      value: assemblyRequestsTable.tableName,
    });

    new cdk.CfnOutput(this, "MobileProductDraftsTableName", {
      value: productDraftsTable.tableName,
    });

    new cdk.CfnOutput(this, "MobileIntegrationQueueUrl", {
      value: integrationQueue.queueUrl,
    });
  }
}

module.exports = { MobileEdgeStack };
