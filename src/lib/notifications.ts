/**
 * Permissão de notificação local.
 *
 * Fora do runtime Tauri (testes ou navegador), a chamada falha e o app segue
 * com o banner in-app (`NOTIF-04`).
 */

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");

    if (await isPermissionGranted()) {
      return true;
    }

    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}
