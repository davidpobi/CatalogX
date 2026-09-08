import type { AuthSession } from "@/interfaces/auth";
import type { ListingImageData, MerchantApplication, MerchantListingDraft } from "@/interfaces/merchant";
import { getSession, signInAdmin, signInWithGoogle, signOutSession } from "@/services/auth.service";
import { createRemoteCollection, deleteRemoteCollection, listCustomerLibrary, mergeRemoteLikes, renameRemoteCollection, setRemoteCollectionItem, setRemoteLike } from "@/services/customer.service";
import { archiveRemoteListing, createRemoteListing, getMerchantDashboard, saveMerchantApplication, submitMerchantApplication, submitRemoteListing, updateRemoteListing, uploadRemoteListingImage } from "@/services/merchant.service";
import { getAdminDashboard, reviewRemoteListing, reviewRemoteMerchant, unpublishRemoteListing } from "@/services/admin.service";
import { clearSavedProductIds, getSavedProductIds } from "@/services/persistence.service";
import { adminCompleted, adminFailed, adminStarted } from "./slices/adminSlice";
import { authAnonymous, authCompleted, authFailed, authPendingActionCleared, authSignedOut, authStarted } from "./slices/authSlice";
import { customerCleared, customerCompleted, customerFailed, customerStarted } from "./slices/customerSlice";
import { merchantDashboardCompleted, merchantFailed, merchantListingCompleted, merchantStarted } from "./slices/merchantSlice";
import { savedProductsChanged } from "./slices/dataSlice";
import type { AppThunk } from "./store";

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const completeSignIn = async (session: AuthSession, dispatch: Parameters<AppThunk>[0], pendingProductId: string | null) => {
  dispatch(authCompleted(session));
  const local = getSavedProductIds();
  const merged = await mergeRemoteLikes([...local, ...(pendingProductId ? [pendingProductId] : [])]);
  dispatch(customerCompleted(merged));
  dispatch(savedProductsChanged(merged.likedProductIds));
  clearSavedProductIds();
  dispatch(authPendingActionCleared());
  return session;
};

export const initializeAuthAction = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  if (getState().auth.status !== "idle") return;
  dispatch(authStarted());
  try {
    const session = await getSession();
    dispatch(authCompleted(session));
    const local = getSavedProductIds();
    const library = local.length ? await mergeRemoteLikes(local) : await listCustomerLibrary();
    dispatch(customerCompleted(library));
    dispatch(savedProductsChanged(library.likedProductIds));
    clearSavedProductIds();
  } catch { dispatch(authAnonymous()); }
};
export const googleSignInAction = (): AppThunk<Promise<AuthSession | null>> => async (dispatch, getState) => {
  dispatch(authStarted());
  try { return await completeSignIn(await signInWithGoogle(), dispatch, getState().auth.pendingAction?.productId ?? null); }
  catch (error) { dispatch(authFailed(errorMessage(error, "Google sign-in failed."))); return null; }
};
export const adminSignInAction = (email: string, password: string): AppThunk<Promise<AuthSession | null>> => async (dispatch) => {
  dispatch(authStarted());
  try { const session = await signInAdmin(email, password); if (!session.user.capabilities.admin) { await signOutSession().catch(() => undefined); throw new Error("This account is not an administrator."); } dispatch(authCompleted(session)); return session; }
  catch (error) { dispatch(authFailed(errorMessage(error, "Admin sign-in failed."))); return null; }
};
export const signOutAction = (): AppThunk<Promise<void>> => async (dispatch) => { await signOutSession().catch(() => undefined); clearSavedProductIds(); dispatch(authSignedOut()); dispatch(customerCleared()); dispatch(savedProductsChanged([])); };

export const loadCustomerLibraryAction = (): AppThunk<Promise<void>> => async (dispatch) => { dispatch(customerStarted()); try { const data = await listCustomerLibrary(); dispatch(customerCompleted(data)); dispatch(savedProductsChanged(data.likedProductIds)); } catch (error) { dispatch(customerFailed(errorMessage(error, "Could not load your library."))); } };
export const setLikeAction = (productId: string, liked: boolean): AppThunk<Promise<void>> => async (dispatch) => { dispatch(customerStarted()); try { const data = await setRemoteLike(productId, liked); dispatch(customerCompleted(data)); dispatch(savedProductsChanged(data.likedProductIds)); } catch (error) { dispatch(customerFailed(errorMessage(error, "Could not update this product."))); } };
export const createCollectionAction = (name: string): AppThunk<Promise<void>> => async (dispatch) => { dispatch(customerStarted()); try { dispatch(customerCompleted(await createRemoteCollection(name))); } catch (error) { dispatch(customerFailed(errorMessage(error, "Could not create the collection."))); } };
export const renameCollectionAction = (id: string, name: string): AppThunk<Promise<void>> => async (dispatch) => { dispatch(customerStarted()); try { dispatch(customerCompleted(await renameRemoteCollection(id, name))); } catch (error) { dispatch(customerFailed(errorMessage(error, "Could not rename the collection."))); } };
export const deleteCollectionAction = (id: string): AppThunk<Promise<void>> => async (dispatch) => { dispatch(customerStarted()); try { dispatch(customerCompleted(await deleteRemoteCollection(id))); } catch (error) { dispatch(customerFailed(errorMessage(error, "Could not delete the collection."))); } };
export const setCollectionItemAction = (collectionId: string, productId: string, included: boolean): AppThunk<Promise<void>> => async (dispatch) => { dispatch(customerStarted()); try { dispatch(customerCompleted(await setRemoteCollectionItem(collectionId, productId, included))); } catch (error) { dispatch(customerFailed(errorMessage(error, "Could not update the collection."))); } };

export const loadMerchantAction = (): AppThunk<Promise<void>> => async (dispatch) => { dispatch(merchantStarted()); try { dispatch(merchantDashboardCompleted(await getMerchantDashboard())); } catch (error) { dispatch(merchantFailed(errorMessage(error, "Could not load merchant workspace."))); } };
export const saveMerchantApplicationAction = (application: Omit<MerchantApplication, "uid" | "status" | "rejectionReason" | "submittedAt" | "updatedAt">): AppThunk<Promise<void>> => async (dispatch) => { dispatch(merchantStarted()); try { dispatch(merchantDashboardCompleted(await saveMerchantApplication(application))); } catch (error) { dispatch(merchantFailed(errorMessage(error, "Could not save the application."))); } };
export const submitMerchantApplicationAction = (): AppThunk<Promise<void>> => async (dispatch) => { dispatch(merchantStarted()); try { dispatch(merchantDashboardCompleted(await submitMerchantApplication())); } catch (error) { dispatch(merchantFailed(errorMessage(error, "Could not submit the application."))); } };
export const saveListingAction = (draft: MerchantListingDraft, listingId?: string): AppThunk<Promise<void>> => async (dispatch) => { dispatch(merchantStarted()); try { dispatch(merchantListingCompleted(listingId ? await updateRemoteListing(listingId, draft) : await createRemoteListing(draft))); } catch (error) { dispatch(merchantFailed(errorMessage(error, "Could not save the listing."))); } };
export const submitListingAction = (listingId: string): AppThunk<Promise<void>> => async (dispatch) => { dispatch(merchantStarted()); try { dispatch(merchantListingCompleted(await submitRemoteListing(listingId))); } catch (error) { dispatch(merchantFailed(errorMessage(error, "Could not submit the listing."))); } };
export const uploadListingImageAction = (file: File): AppThunk<Promise<ListingImageData | null>> => async (dispatch) => { dispatch(merchantStarted()); try { return await uploadRemoteListingImage(file); } catch (error) { dispatch(merchantFailed(errorMessage(error, "Could not upload the image."))); return null; } };
export const archiveListingAction = (listingId: string): AppThunk<Promise<void>> => async (dispatch) => { dispatch(merchantStarted()); try { dispatch(merchantListingCompleted(await archiveRemoteListing(listingId))); } catch (error) { dispatch(merchantFailed(errorMessage(error, "Could not archive the listing."))); } };

export const loadAdminAction = (): AppThunk<Promise<void>> => async (dispatch) => { dispatch(adminStarted()); try { dispatch(adminCompleted(await getAdminDashboard())); } catch (error) { dispatch(adminFailed(errorMessage(error, "Could not load the review queue."))); } };
export const reviewMerchantAction = (id: string, decision: "approve" | "reject", reason: string | null): AppThunk<Promise<void>> => async (dispatch) => { dispatch(adminStarted()); try { dispatch(adminCompleted(await reviewRemoteMerchant(id, decision, reason))); } catch (error) { dispatch(adminFailed(errorMessage(error, "Could not review the merchant."))); } };
export const reviewListingAction = (id: string, decision: "approve" | "reject", reason: string | null): AppThunk<Promise<void>> => async (dispatch) => { dispatch(adminStarted()); try { dispatch(adminCompleted(await reviewRemoteListing(id, decision, reason))); } catch (error) { dispatch(adminFailed(errorMessage(error, "Could not review the listing."))); } };
export const unpublishListingAction = (id: string, reason: string | null): AppThunk<Promise<void>> => async (dispatch) => { dispatch(adminStarted()); try { dispatch(adminCompleted(await unpublishRemoteListing(id, reason))); } catch (error) { dispatch(adminFailed(errorMessage(error, "Could not unpublish the listing."))); } };
