"""Create the unique indexes required by email and Google account linking.

Run once during deployment after setting backend/.env. The script refuses to
create indexes if legacy accounts collide after email normalization.
"""

from app.database.mongodb import users_collection


def main():
    duplicate_emails = list(users_collection.aggregate([
        {"$match": {"email": {"$type": "string"}}},
        {"$group": {"_id": {"$toLower": "$email"}, "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 1},
    ]))
    if duplicate_emails:
        raise RuntimeError(
            "Duplicate email accounts exist (case-insensitive). Resolve them before deploying auth indexes."
        )

    # Keep stored email keys in the same canonical form used by login routes.
    users_collection.update_many(
        {"email": {"$type": "string"}},
        [{"$set": {"email": {"$toLower": "$email"}}}],
    )

    duplicate_google_ids = list(users_collection.aggregate([
        {"$match": {"google_sub": {"$type": "string"}}},
        {"$group": {"_id": "$google_sub", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 1},
    ]))
    if duplicate_google_ids:
        raise RuntimeError(
            "Duplicate Google identities exist. Resolve them before deploying auth indexes."
        )

    users_collection.create_index(
        "email",
        unique=True,
        partialFilterExpression={"email": {"$type": "string"}},
        name="uq_users_email",
    )
    users_collection.create_index(
        "google_sub",
        unique=True,
        partialFilterExpression={"google_sub": {"$type": "string"}},
        name="uq_users_google_sub",
    )
    print("Authentication indexes are ready.")


if __name__ == "__main__":
    main()
