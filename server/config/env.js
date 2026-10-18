// Import this module first in any entry point. ES module imports run in order, so this loads
// server/.env before modules that read process.env at import time (e.g. the polling service).
import dotenv from "dotenv";

dotenv.config();
