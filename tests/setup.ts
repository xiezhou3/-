import { config } from "dotenv";
import path from "node:path";
config({ path: ".env.test" });
process.env.FILE_STORAGE_ROOT ??= path.join(process.cwd(), ".test-storage");
process.env.STORAGE_DRIVER ??= "local";
