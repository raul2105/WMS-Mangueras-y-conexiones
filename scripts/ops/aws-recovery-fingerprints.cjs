const fs=require('node:fs');
const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const mode=process.argv[2];
const directory=path.resolve('output/production-restore-proof-20260930');
const canonical='wms-web-dev-pg.cvb2fezndc4e.us-east-1.rds.amazonaws.com';
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
    const [migrations]=await tx.$queryRawUnsafe('SELECT count(*)::int AS total,count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS unfinished FROM "_prisma_migrations"');
    return {mode,at:new Date().toISOString(),endpoint:url.hostname,fingerprints,inventory,foreignKeys,migrations};
  },{isolationLevel:'RepeatableRead',timeout:60000});
  proof.passed=proof.inventory.inconsistent===0&&proof.foreignKeys.unvalidated===0&&proof.migrations.total===26&&proof.migrations.unfinished===0;
  if(mode==='restored'){
    const baseline=JSON.parse(fs.readFileSync(path.join(directory,'baseline.json'),'utf8'));
    proof.preserved=JSON.stringify(proof.fingerprints)===JSON.stringify(baseline.fingerprints);
    proof.passed=proof.passed&&baseline.passed&&proof.preserved;
  }
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,mode+'.json'),JSON.stringify(proof,null,2));
  process.stdout.write(JSON.stringify({mode,passed:proof.passed,preserved:proof.preserved,tables:Object.keys(proof.fingerprints).length,inventory:proof.inventory,foreignKeys:proof.foreignKeys,migrations:proof.migrations}));
  if(!proof.passed)process.exitCode=1;
}
main().catch(error=>{process.stderr.write(`Recovery fingerprints failed (${error?.code??error?.name??'error'}); details suppressed.\n`);process.exitCode=1;}).finally(()=>db.$disconnect());
