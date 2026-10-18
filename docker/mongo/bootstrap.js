// Run after the official image has created its authenticated root account.
// Initdb scripts run against a temporary standalone server, so rs.initiate()
// belongs here instead. This also works with an existing standalone volume.
const uri = 'mongodb://mongodb:27017/admin?directConnection=true&serverSelectionTimeoutMS=2000';
let ready = false;

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const admin = new Mongo(uri).getDB('admin');
    admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);

    let status;
    try {
      status = admin.runCommand({ replSetGetStatus: 1 });
      if (status.ok !== 1) throw status;
    } catch (error) {
      if (error.code !== 94 && error.codeName !== 'NotYetInitialized') throw error;
      const initialized = admin.runCommand({
        replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: 'mongodb:27017' }] },
      });
      if (initialized.ok !== 1 && initialized.codeName !== 'AlreadyInitialized') throw initialized;
      sleep(2000);
      continue;
    }

    if (status.set !== 'rs0') throw new Error('Unexpected replica-set name; expected rs0.');
    if (status.myState === 1) {
      ready = true;
      break;
    }
  } catch (error) {
    // Retry startup/election races. Avoid including credentials in diagnostics.
    if (attempt === 59) {
      print('MongoDB bootstrap failed. Check MongoDB logs and the root credentials for this volume.');
    }
  }
  sleep(2000);
}

if (!ready) quit(1);
print('MongoDB rs0 is authenticated and PRIMARY.');
