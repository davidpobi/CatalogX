import { MerchantOnboarding } from "@/components/MerchantOnboarding";
import { requireCustomerSession } from "@/app/api/utils/authUtils";
export default async function MerchantOnboardingPage() { await requireCustomerSession(); return <MerchantOnboarding />; }
