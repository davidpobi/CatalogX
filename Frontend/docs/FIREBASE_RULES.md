# CatalogX Firebase rules reference

These rules are documentation only. CatalogX does not deploy Firebase rules from this repository. Add and review them manually in the Firebase console alongside the production project configuration.

The application uses authenticated server routes and the Firebase Admin SDK for every mutation. The default policy is therefore deny by default. Do not grant browser writes to merchant applications, merchant listings, public catalogue projections, administration records, audit events, or private listing media.

## Firestore

```rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    // Server routes enforce merchant, admin, ownership and state transitions.
    match /{document=**} {
      allow read, write: if false;
    }

    // A customer may read their own profile only. Server routes create and update it.
    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create, update, delete: if false;

      match /likes/{productId} {
        allow read: if isOwner(uid);
        allow create, update, delete: if false;
      }

      match /collections/{collectionId} {
        allow read: if isOwner(uid);
        allow create, update, delete: if false;

        match /items/{productId} {
          allow read: if isOwner(uid);
          allow create, update, delete: if false;
        }
      }
    }

    match /merchantApplications/{uid} {
      allow read, write: if false;
    }

    match /merchants/{uid} {
      allow read, write: if false;
    }

    match /merchantListings/{listingId} {
      allow read, write: if false;
      match /versions/{versionId} {
        allow read, write: if false;
      }
    }

    match /admins/{uid} {
      allow read, write: if false;
    }

    match /adminAuditEvents/{eventId} {
      allow read, write: if false;
    }

    // Public catalogue data is supplied by the application, not direct Firestore reads.
    match /projects/CatalogX/listings/{productId} {
      allow read, write: if false;
    }
  }
}
```

## Storage

```rules
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Merchant images are normalized and written through an authenticated server route.
    // Signed, short-lived reads are issued only after server-side owner/admin checks.
    match /projects/CatalogX/merchant-assets/{merchantId}/{fileName} {
      allow read, write: if false;
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## Manual release checklist

- Keep Firebase client SDKs out of direct Firestore and Storage write paths.
- Confirm every Admin SDK route independently authorizes the Firebase session and resource ownership.
- Keep approved public product images separate from private merchant upload paths when introducing CDN delivery.
- Test rules in the Firebase Rules Playground before publishing any console change.
- Never paste credentials, signed URLs, customer data, or production IDs into this document.
