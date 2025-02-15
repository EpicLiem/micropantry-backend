const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const FormData = require("form-data");

admin.initializeApp();

const db = admin.firestore();


exports.createUserProfile = functions.auth.user().onCreate(async (user) => {
    const userRef = db.collection("users").doc(user.uid);

    await userRef.set({
        email: user.email,
        onboardDate: admin.firestore.FieldValue.serverTimestamp(),
        onboarded: false,
        pantry: [],
        preferredProviders: {}
    });

    console.log(`User profile created for UID: ${user.uid}`);
});


exports.addPantryItem = functions.https.onCall(async (data, context) => {
    // data expected: { name, calories, macros, servings, likability, ... }
    // context.auth to determine user ID
    const userId = context.auth?.uid;
    if (!userId) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }

    const { name, calories, macros, servings, likability } = data;

    const pantryRef = db
        .collection("users")
        .doc(userId)
        .collection("pantry");

    const newItem = {
        name,
        calories: calories || 0,
        servings: servings || 1,
        likability: likability || 0,
        macros: macros || {},
    };

    const addedItemRef = await pantryRef.add(newItem);
    return { pantryItemId: addedItemRef.id };
});


exports.updatePantryItem = functions.https.onCall(async (data, context) => {
    // data expected: { pantryItemId, fieldsToUpdate }
    const userId = context.auth?.uid;
    if (!userId) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }

    const { pantryItemId, fieldsToUpdate } = data;

    if (!pantryItemId || !fieldsToUpdate) {
        throw new functions.https.HttpsError("invalid-argument", "Missing arguments");
    }

    const pantryItemRef = db
        .collection("users")
        .doc(userId)
        .collection("pantry")
        .doc(pantryItemId);

    await pantryItemRef.update(fieldsToUpdate);
    return { success: true };
});

exports.createShoppingList = functions.https.onCall(async (data, context) => {
    // data can contain "title" or "store" or any meta info
    const userId = context.auth?.uid;
    if (!userId) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }

    const { title = "My Shopping List", store } = data;

    const shoppingListsRef = db
        .collection("users")
        .doc(userId)
        .collection("shoppingLists");

    const newList = {
        title,
        store: store || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        items: []
    };

    const docRef = await shoppingListsRef.add(newList);

    return { listId: docRef.id };
});

exports.addItemToShoppingList = functions.https.onCall(async (data, context) => {
    // data expected: { listId, itemName, quantity, custom... }
    const userId = context.auth?.uid;
    if (!userId) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }

    const { listId, itemName, quantity = 1 } = data;

    if (!listId || !itemName) {
        throw new functions.https.HttpsError("invalid-argument", "Missing listId or itemName");
    }

    const listRef = db
        .collection("users")
        .doc(userId)
        .collection("shoppingLists")
        .doc(listId);

    // Use arrayUnion to add items to an array field
    await listRef.update({
        items: admin.firestore.FieldValue.arrayUnion({
            itemName,
            quantity,
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
    });

    return { success: true };
});

exports.removeItemFromShoppingList = functions.https.onCall(async (data, context) => {
    // data expected: { listId, itemName }
    // prob should also track item IDs or indexes for more precise removal
    const userId = context.auth?.uid;
    if (!userId) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in");
    }

    const { listId, itemName } = data;

    if (!listId || !itemName) {
        throw new functions.https.HttpsError("invalid-argument", "Missing arguments");
    }

    const listRef = db
        .collection("users")
        .doc(userId)
        .collection("shoppingLists")
        .doc(listId);

    const doc = await listRef.get();
    if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "List not found");
    }

    const { items } = doc.data();
    const updatedItems = (items || []).filter(i => i.itemName !== itemName);

    await listRef.update({ items: updatedItems });

    return { success: true };
});

