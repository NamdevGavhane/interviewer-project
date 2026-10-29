const mongoose = require('mongoose');

let mongoServer;

const extractDbName = (uri) => {
  try {
    const url = new URL(uri.replace(/^mongodb\+srv:\/\//, 'http://').replace(/^mongodb:\/\//, 'http://'));
    const pathname = url.pathname.replace(/^\//, '');
    return pathname.split('/')[0];
  } catch {
    const match = uri.match(/(?:\/)([a-zA-Z0-9_\-]+)(?:\?|$)/);
    return match ? match[1] : '';
  }
};

const connectTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (process.env.MONGO_URI_TEST) {
    const dbName = extractDbName(process.env.MONGO_URI_TEST);
    if (!dbName || !dbName.toLowerCase().includes('test')) {
      throw new Error(`Refusing to run tests: MONGO_URI_TEST database name "${dbName}" does not contain "test". clearTestDB wipes the database.`);
    }
    await mongoose.connect(process.env.MONGO_URI_TEST);
    return;
  }

  if (!mongoServer) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoServer = await MongoMemoryServer.create();
  }
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
};

const closeTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};

const clearTestDB = async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

module.exports = {
  connectTestDB,
  closeTestDB,
  clearTestDB
};
