import { modals } from "@mantine/modals";
import i18n from "@/i18n";
import {
  LockedPageInfo,
  lockedPageFromError,
} from "@/features/page-password/page-password";
import { PageUnlockForm } from "@/features/page-password/components/page-unlock-form";

// Asks for a page's password in a dialog. Resolves true once unlocked,
// false when the dialog is closed.
export function promptPageUnlock(page: LockedPageInfo): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (unlocked: boolean) => {
      if (settled) return;
      settled = true;
      modals.close(id);
      resolve(unlocked);
    };
    const id = modals.open({
      title: i18n.t("Enter the password"),
      centered: true,
      onClose: () => finish(false),
      children: (
        <PageUnlockForm
          page={page}
          onUnlocked={() => finish(true)}
          onCancel={() => finish(false)}
        />
      ),
    });
  });
}

// Runs an action that may need a page's password, such as moving a page
// into or out of a protected page: asks for each password it needs and
// tries again.
export async function withPageUnlock<T>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (err) {
      const locked = lockedPageFromError(err);
      if (!locked || attempt >= 5) throw err;
      if (!(await promptPageUnlock(locked))) throw err;
    }
  }
}
