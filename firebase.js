const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, getDoc, setDoc, updateDoc, addDoc, query, where, orderBy, getDocs } = require('firebase/firestore');

// Check if Firebase credentials are available
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_API_KEY) {
  console.error('Error: Firebase credentials are missing. Please check your .env file.');
  console.error('Make sure you have FIREBASE_PROJECT_ID and FIREBASE_API_KEY defined.');
  process.exit(1);
}

// Initialize Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '714147266029',
  appId: process.env.FIREBASE_APP_ID || '1:714147266029:web:04a3a15ced332f784c3be4',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-PM7GWZNHHF'
};

const app = initializeApp(firebaseConfig);
console.log('Firebase initialized with project ID:', process.env.FIREBASE_PROJECT_ID);

// Initialize Firestore
const db = getFirestore(app);

// Collection references
const usersCollection = collection(db, 'users');
const imagesCollection = collection(db, 'images');
const transactionsCollection = collection(db, 'transactions');

// User functions
const getUserById = async (userId) => {
  try {
    const userDocRef = doc(usersCollection, userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      return null;
    }
    return { id: userDocSnap.id, ...userDocSnap.data() };
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
};

const createOrUpdateUser = async (userData) => {
  try {
    const { id, ...userDataWithoutId } = userData;
    const userDocRef = doc(usersCollection, id);

    // Check if user exists
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      // Update existing user
      await updateDoc(userDocRef, {
        ...userDataWithoutId,
        updatedAt: new Date()
      });
    } else {
      // Create new user
      await setDoc(userDocRef, {
        ...userDataWithoutId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return { id, ...userDataWithoutId };
  } catch (error) {
    console.error('Error creating/updating user:', error);
    throw error;
  }
};

const updateUserCredits = async (userId, credits) => {
  try {
    const userDocRef = doc(usersCollection, userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const userData = userDocSnap.data();
    const updatedCredits = (userData.credits || 0) + credits;

    await updateDoc(userDocRef, {
      credits: updatedCredits,
      updatedAt: new Date()
    });

    return updatedCredits;
  } catch (error) {
    console.error('Error updating user credits:', error);
    throw error;
  }
};

// Image functions
const saveGeneratedImage = async (imageData) => {
  try {
    const imageDocRef = await addDoc(imagesCollection, {
      ...imageData,
      createdAt: new Date()
    });

    return { id: imageDocRef.id, ...imageData };
  } catch (error) {
    console.error('Error saving generated image:', error);
    throw error;
  }
};

const getUserImages = async (userId) => {
  try {
    const imagesQuery = query(
      imagesCollection,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const imagesSnapshot = await getDocs(imagesQuery);

    return imagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    }));
  } catch (error) {
    console.error('Error getting user images:', error);
    throw error;
  }
};

// Transaction functions
const saveTransaction = async (transactionData) => {
  try {
    const transactionDocRef = await addDoc(transactionsCollection, {
      ...transactionData,
      createdAt: new Date()
    });

    return { id: transactionDocRef.id, ...transactionData };
  } catch (error) {
    console.error('Error saving transaction:', error);
    throw error;
  }
};

const getUserTransactions = async (userId) => {
  try {
    const transactionsQuery = query(
      transactionsCollection,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const transactionsSnapshot = await getDocs(transactionsQuery);

    return transactionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    }));
  } catch (error) {
    console.error('Error getting user transactions:', error);
    throw error;
  }
};

module.exports = {
  db,
  usersCollection,
  imagesCollection,
  transactionsCollection,
  getUserById,
  createOrUpdateUser,
  updateUserCredits,
  saveGeneratedImage,
  getUserImages,
  saveTransaction,
  getUserTransactions
};
