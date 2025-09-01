function getBuildId() {
  try {
    return require("fs").readFileSync("./.next/BUILD_ID", "utf8").trim();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return "development";
    }
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  process.env["BUILD_ID"] = getBuildId();
}
