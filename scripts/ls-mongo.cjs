const { MongoClient } = require("mongodb");
(async () => {
  const uri = process.argv[2];
  const c = new MongoClient(uri);
  await c.connect();
  const dbs = (await c.db().admin().listDatabases()).databases.map(d=>d.name).filter(n=>!["admin","config","local"].includes(n));
  for (const name of dbs) {
    const d = c.db(name);
    const colls = await d.listCollections().toArray();
    console.log(`  ${name}: ${colls.length} collections`);
    for (const co of colls.slice(0,40)) {
      const n = await d.collection(co.name).estimatedDocumentCount();
      console.log(`    ${co.name}\t${n}`);
    }
  }
  await c.close();
})().catch(e => { console.error(e.message); process.exit(1); });
