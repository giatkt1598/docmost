import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

export default function ForgotPassword() {
    const { t } = useTranslation();
    return (
        <>
            <DocumentTitle title={t("Forgot password")} />
            <ForgotPasswordForm />
        </>
    );
}
