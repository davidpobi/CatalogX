import { z } from "zod";
import type { ApiRouteResult } from "@/interfaces/api";
import type { CustomerCollection } from "@/interfaces/customer";
import { CustomerOperations } from "@/interfaces/customer";
import { collectionNameSchema, idSchema } from "../../validations/marketplace";
import { createCustomerCollection, deleteCustomerCollection, getCustomerCollection, getCustomerLibrary, mergeCustomerLikes, renameCustomerCollection, setCollectionItem, setCustomerLike } from "../../services/customer.service";
import { failure } from "../../utils/httpUtils";

const product = z.object({ productId: idSchema });
const collection = z.object({ collectionId: idSchema });
const namedCollection = collection.extend({ name: collectionNameSchema });
const collectionItem = collection.extend({ productId: idSchema });
const likes = z.object({ productIds: z.array(idSchema).max(100) });
const safe = async <T>(action: () => Promise<T>): Promise<ApiRouteResult<T>> => { try { return { status: 200, data: await action() }; } catch { return failure(422, "Customer request could not be completed."); } };

export const handleCustomerOperation = (operation: CustomerOperations, uid: string, body: Record<string, unknown>) => {
  switch (operation) {
    case CustomerOperations.ListLikes:
    case CustomerOperations.ListCollections: return safe(() => getCustomerLibrary(uid));
    case CustomerOperations.AddLike: { const parsed = product.safeParse(body); return parsed.success ? safe(() => setCustomerLike(uid, parsed.data.productId, true)) : Promise.resolve(failure(422, "A valid product is required.")); }
    case CustomerOperations.RemoveLike: { const parsed = product.safeParse(body); return parsed.success ? safe(() => setCustomerLike(uid, parsed.data.productId, false)) : Promise.resolve(failure(422, "A valid product is required.")); }
    case CustomerOperations.MergeLocalLikes: { const parsed = likes.safeParse(body); return parsed.success ? safe(() => mergeCustomerLikes(uid, parsed.data.productIds)) : Promise.resolve(failure(422, "Valid product IDs are required.")); }
    case CustomerOperations.CreateCollection: { const parsed = z.object({ name: collectionNameSchema }).safeParse(body); return parsed.success ? safe(() => createCustomerCollection(uid, parsed.data.name)) : Promise.resolve(failure(422, "A valid collection name is required.")); }
    case CustomerOperations.RenameCollection: { const parsed = namedCollection.safeParse(body); return parsed.success ? safe(() => renameCustomerCollection(uid, parsed.data.collectionId, parsed.data.name)) : Promise.resolve(failure(422, "A valid collection is required.")); }
    case CustomerOperations.DeleteCollection: { const parsed = collection.safeParse(body); return parsed.success ? safe(() => deleteCustomerCollection(uid, parsed.data.collectionId)) : Promise.resolve(failure(422, "A valid collection is required.")); }
    case CustomerOperations.AddCollectionItem:
    case CustomerOperations.RemoveCollectionItem: { const parsed = collectionItem.safeParse(body); return parsed.success ? safe(() => setCollectionItem(uid, parsed.data.collectionId, parsed.data.productId, operation === CustomerOperations.AddCollectionItem)) : Promise.resolve(failure(422, "A valid collection item is required.")); }
    case CustomerOperations.GetCollection: { const parsed = collection.safeParse(body); return parsed.success ? safe<CustomerCollection>(() => getCustomerCollection(uid, parsed.data.collectionId)) : Promise.resolve(failure(422, "A valid collection is required.")); }
    default: return Promise.resolve(failure(400, "Invalid customer operation."));
  }
};
