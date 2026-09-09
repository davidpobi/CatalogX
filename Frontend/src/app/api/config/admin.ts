import "server-only";

const configuredAdminId = () => process.env.ADMIN_ID?.trim() || null;

export const isConfiguredAdminId = (uid: string) => {
  const adminId = configuredAdminId();
  return Boolean(adminId && uid === adminId);
};
