import { confirm, message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

let updateCheckStarted = false;

export async function checkForAppUpdateOnLaunch() {
  if (updateCheckStarted) return;
  updateCheckStarted = true;

  try {
    const update = await check();

    if (!update) return;

    const shouldInstall = await confirm(
      `NoteLab ${update.version} is available. Install it now?`,
      {
        title: "Update available",
        kind: "info",
        okLabel: "Install",
        cancelLabel: "Later",
      }
    );

    if (!shouldInstall) return;

    await update.downloadAndInstall();
    await message("Update installed. NoteLab will restart now.", {
      title: "Update installed",
      kind: "info",
      okLabel: "Restart",
    });
    await relaunch();
  } catch (error) {
    console.warn("App update check failed", error);
  }
}
