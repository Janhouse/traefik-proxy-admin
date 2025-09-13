import { readFileSync } from "fs";

function getBuildId() {
  try {
    return readFileSync("./.next/BUILD_ID", "utf8").trim();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return "development";
    }
    return "development";
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  process.env["BUILD_ID"] = getBuildId();
}
