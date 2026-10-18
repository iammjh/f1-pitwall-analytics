let healthy = false;
try {
  const admin = new Mongo('mongodb://localhost:27017/admin?directConnection=true&serverSelectionTimeoutMS=2000').getDB('admin');
  admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD);
  const status = admin.runCommand({ replSetGetStatus: 1 });
  healthy = status.ok === 1 && status.set === 'rs0' && status.myState === 1;
} catch (_) {
  // Authentication, startup, or election failure keeps the service unhealthy.
}
quit(healthy ? 0 : 1);
