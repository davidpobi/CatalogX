export enum CustomerOperations {
  ListLikes = "listLikes",
  AddLike = "addLike",
  RemoveLike = "removeLike",
  ListCollections = "listCollections",
  GetCollection = "getCollection",
  CreateCollection = "createCollection",
  RenameCollection = "renameCollection",
  DeleteCollection = "deleteCollection",
  AddCollectionItem = "addCollectionItem",
  RemoveCollectionItem = "removeCollectionItem",
  MergeLocalLikes = "mergeLocalLikes",
}

export interface ProductLike { productId: string; createdAt: string; }
export interface CollectionItem { productId: string; addedAt: string; }
export interface CustomerCollection {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: CollectionItem[];
}

export interface CustomerLibraryData {
  likedProductIds: string[];
  collections: CustomerCollection[];
}

export interface CustomerState extends CustomerLibraryData {
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}
