const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const mode=process.argv[2];
const directory=path.resolve('output/production-restore-proof-20260930');
const canonical='wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com';
const expectedMigration={name:'20260930210000_add_technical_selection_snapshot',checksum:'1e23a8da96535ae2d766289fef9a40e7ffb72b5f136264b59d1ca6f3ecc0e717'};
const expectedSeeds=[
  {id:'b4cb2a97-3e63-4990-9b45-b15a3376bede',email:'admin@scmayher.com',role:'SYSTEM_ADMIN'},
  {id:'53a43758-2962-4fcc-902e-6df44043b4b3',email:'admin2@scmayher.com',role:'SYSTEM_ADMIN'},
  {id:'b709930b-4228-4cf1-8bd8-7b42ea812dcc',email:'manager@scmayher.com',role:'MANAGER'},
  {id:'625e095b-995d-44ab-8247-fa8458ce1dad',email:'operator@scmayher.com',role:'WAREHOUSE_OPERATOR'},
  {id:'fa230e8b-6783-4d46-afa3-50333860bba1',email:'sales@scmayher.com',role:'SALES_EXECUTIVE'},
];
const expectedRetirementSha='eecd49133c6ca668f1901cc538f74aedfd0bcb214b6450cc168d066547efd5e5';
const expectedUserManifestSha='4bd244d04393598842a20b78ad65e9962583c8775a6bdbe5913ed98b30b5c6e1';
const expectedRetirementPath=path.resolve('output/historical-test-user-retirement-20260930.json');
const expectedUserManifestPath=path.resolve('output/aws-canonical-user-metadata-20260930.json');
function readPinnedJson(file,expectedSha){
  const bytes=fs.readFileSync(file);
  const actualSha=crypto.createHash('sha256').update(bytes).digest('hex');
  if(actualSha!==expectedSha)throw new Error('Pinned recovery evidence fingerprint mismatch');
  return JSON.parse(bytes.toString('utf8'));
}
function expectedRetiredUsers(){
  const manifest=readPinnedJson(expectedUserManifestPath,expectedUserManifestSha);
  const retirement=readPinnedJson(expectedRetirementPath,expectedRetirementSha);
  if(manifest.readOnly!==true||manifest.users?.length!==30||retirement.users?.before!==30||retirement.users?.after!==30
    ||retirement.users?.seedsPreserved!==5||retirement.users?.historicalTargetsRetired!==25
    ||retirement.auditsAdded!==25||retirement.sourceManifest?.sha256!==expectedUserManifestSha) {
    throw new Error('Pinned user-retirement evidence is incomplete');
  }
  for(const seed of expectedSeeds){
    const row=manifest.users.find(user=>user.id===seed.id);
    if(!row||row.email!==seed.email||row.isActive!==true||row.userRoles?.length!==1
      ||row.userRoles[0].role?.code!==seed.role||row.userRoles[0].role?.isActive!==true) {
      throw new Error('Canonical seed identity manifest mismatch');
    }
  }
  const seedIds=new Set(expectedSeeds.map(seed=>seed.id));
  const targets=manifest.users.filter(user=>!seedIds.has(user.id));
  const retired=retirement.users.identities;
  if(targets.length!==25||retired?.length!==25)throw new Error('Historical QA retirement evidence count mismatch');
  const retiredById=new Map(retired.map(user=>[user.id,user]));
  for(const expected of targets){
    const actual=retiredById.get(expected.id);
    if(!actual||actual.email!==expected.email||actual.role!==expected.userRoles?.[0]?.role?.code
      ||actual.beforeActive!==true||actual.afterActive!==false) {
      throw new Error('Historical QA retirement evidence does not match pinned identities');
    }
  }
  if(retiredById.size!==25)throw new Error('Unexpected historical QA retirement identities');
  return {retired:targets.map(user=>({id:user.id,email:user.email,role:user.userRoles[0].role.code}))};
}
let url;
try { url=new URL(process.env.DATABASE_URL); } catch { throw new Error('A valid canonical database session is required; connection details suppressed'); }
if(!['baseline','restored'].includes(mode)||url.hostname!==canonical||url.pathname!=='/wms'||url.searchParams.get('schema')!=='public') throw new Error('Canonical recovery guard');
if(mode==='restored') {
  const endpoint=process.env.WMS_RESTORE_QA_ENDPOINT;
  if(!/^wms-prod-restore-20260930-[0-9a-f]{12}\.[a-z0-9]+\.us-east-1\.rds\.amazonaws\.com$/.test(endpoint??''))throw new Error('Owned restore endpoint guard');
  url.hostname=endpoint;
}
url.searchParams.set('sslmode','require');
const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
async function main(){
  const proof=await db.$transaction(async tx=>{
    const tables=await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const fingerprints={};
    for(const {tablename} of tables) {
      if(!/^[A-Za-z0-9_]+$/.test(tablename))throw new Error('Unrecognized recovery table');
      fingerprints[tablename]=(await tx.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM "${tablename}" t`))[0];
    }
    const [inventory]=await tx.$queryRawUnsafe('SELECT count(*)::int AS total,count(*) FILTER (WHERE quantity<0 OR reserved<0 OR available<0 OR abs(quantity-reserved-available)>0.000001)::int AS inconsistent FROM "Inventory"');
    const [foreignKeys]=await tx.$queryRawUnsafe("SELECT count(*)::int AS total,count(*) FILTER (WHERE NOT convalidated)::int AS unvalidated FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace");
    const [migrations]=await tx.$queryRawUnsafe('SELECT count(*)::int AS total,count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied,count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS unfinished,count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int AS rolledBack FROM "_prisma_migrations"');
    const expectedMigrationRows=await tx.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1',expectedMigration.name);
    const userRows=await tx.$queryRawUnsafe('SELECT u.id,u.email,u."isActive",r.code AS "roleCode",r."isActive" AS "roleActive" FROM "User" u LEFT JOIN "UserRole" ur ON ur."userId"=u.id LEFT JOIN "Role" r ON r.id=ur."roleId" ORDER BY u.id');
    return {mode,at:new Date().toISOString(),endpoint:url.hostname,fingerprints,inventory,foreignKeys,migrations,expectedMigrationRows,userRows};
  },{isolationLevel:'RepeatableRead',timeout:60000});
  const expectedRetirement=expectedRetiredUsers();
  const usersById=new Map();
  for(const row of proof.userRows){
    const current=usersById.get(row.id)||{id:row.id,email:row.email,isActive:row.isActive,roles:[]};
    if(row.roleCode)current.roles.push({code:row.roleCode,active:row.roleActive});
    usersById.set(row.id,current);
  }
  const users=[...usersById.values()];
  const seedsMatch=expectedSeeds.every(expected=>{
    const actual=usersById.get(expected.id);
    return actual?.email===expected.email&&actual.isActive===true&&actual.roles.length===1
      &&actual.roles[0].code===expected.role&&actual.roles[0].active===true;
  });
  const retiredMatch=expectedRetirement.retired.every(expected=>{
    const actual=usersById.get(expected.id);
    return actual?.email===expected.email&&actual.isActive===false&&actual.roles.length===1
      &&actual.roles[0].code===expected.role&&actual.roles[0].active===true;
  });
  proof.users={total:users.length,active:users.filter(user=>user.isActive).length,seedCount:expectedSeeds.length,seedsMatch,retiredFixtureCount:expectedRetirement.retired.length,retiredFixturesMatch:retiredMatch,passed:users.length===30&&users.filter(user=>user.isActive).length===5&&seedsMatch&&retiredMatch};
  const expectedMigrationRow=proof.expectedMigrationRows.length===1?proof.expectedMigrationRows[0]:null;
  proof.migration26={name:expectedMigration.name,checksumMatch:expectedMigrationRow?.checksum===expectedMigration.checksum,applied:!!expectedMigrationRow?.finished_at&&!expectedMigrationRow?.rolled_back_at};
  delete proof.expectedMigrationRows;
  delete proof.userRows;
  proof.passed=proof.inventory.inconsistent===0&&proof.foreignKeys.unvalidated===0&&proof.migrations.total===26
    &&proof.migrations.applied===26&&proof.migrations.unfinished===0&&proof.migrations.rolledBack===0
    &&proof.migration26.checksumMatch&&proof.migration26.applied&&proof.users.passed;
  if(mode==='restored'){
    const baseline=JSON.parse(fs.readFileSync(path.join(directory,'baseline.json'),'utf8'));
    proof.preserved=JSON.stringify(proof.fingerprints)===JSON.stringify(baseline.fingerprints);
    proof.passed=proof.passed&&baseline.passed&&proof.preserved;
  }
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,mode+'.json'),JSON.stringify(proof,null,2));
  process.stdout.write(JSON.stringify({mode,passed:proof.passed,preserved:proof.preserved,tables:Object.keys(proof.fingerprints).length,inventory:proof.inventory,foreignKeys:proof.foreignKeys,migrations:proof.migrations,migration26:proof.migration26,users:proof.users}));
  if(!proof.passed)process.exitCode=1;
}
main().catch(error=>{process.stderr.write(`Recovery fingerprints failed (${error?.code??error?.name??'error'}); details suppressed.\n`);process.exitCode=1;}).finally(()=>db.$disconnect());
