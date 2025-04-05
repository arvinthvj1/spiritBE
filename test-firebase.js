require('dotenv').config();
const firebase = require('./firebase');

async function testFirebase() {
  try {
    console.log('Testing Firebase connection...');
    
    // Test creating a user
    const testUser = {
      id: 'test-user-' + Date.now(),
      name: 'Test User',
      email: 'test@example.com',
      credits: 5
    };
    
    console.log('Creating test user:', testUser);
    const createdUser = await firebase.createOrUpdateUser(testUser);
    console.log('User created successfully:', createdUser);
    
    // Test getting the user
    console.log('Fetching user by ID:', testUser.id);
    const fetchedUser = await firebase.getUserById(testUser.id);
    console.log('User fetched successfully:', fetchedUser);
    
    // Test updating user credits
    console.log('Updating user credits...');
    const updatedCredits = await firebase.updateUserCredits(testUser.id, 10);
    console.log('Credits updated successfully. New credits:', updatedCredits);
    
    // Test saving an image
    console.log('Saving test image...');
    const testImage = {
      userId: testUser.id,
      prompt: 'Test prompt',
      enhancedPrompt: 'Enhanced test prompt',
      style: 'ghibli-nature',
      detailLevel: 50,
      imageUrl: 'https://example.com/test-image.jpg'
    };
    
    const savedImage = await firebase.saveGeneratedImage(testImage);
    console.log('Image saved successfully:', savedImage.id);
    
    // Test getting user images
    console.log('Fetching user images...');
    const userImages = await firebase.getUserImages(testUser.id);
    console.log('User images fetched successfully. Count:', userImages.length);
    
    // Test saving a transaction
    console.log('Saving test transaction...');
    const testTransaction = {
      userId: testUser.id,
      imageId: savedImage.id,
      credits: -1,
      type: 'test',
      prompt: 'Test prompt'
    };
    
    const savedTransaction = await firebase.saveTransaction(testTransaction);
    console.log('Transaction saved successfully:', savedTransaction.id);
    
    console.log('All Firebase tests passed successfully!');
  } catch (error) {
    console.error('Firebase test failed:', error);
  }
}

testFirebase();
