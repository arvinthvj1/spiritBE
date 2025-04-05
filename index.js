require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { OpenAI } = require('openai');
const firebase = require('./firebase');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit
  fileFilter: function (_req, file, cb) {
    console.log('Multer fileFilter called with file:', file.originalname, file.mimetype);
    // Accept only JPG and PNG files
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      console.log('File rejected: not a JPG or PNG');
      return cb(new Error('Only JPG and PNG files are allowed!'), false);
    }
    console.log('File accepted');
    cb(null, true);
  }
});

// Add error handling for multer
const uploadMiddleware = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    next();
  });
};

// Check if Razorpay credentials are available
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('Error: Razorpay credentials are missing. Please check your .env file.');
  console.error('Make sure you have RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET defined.');
  process.exit(1);
}

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

console.log('Razorpay initialized successfully with key_id:', process.env.RAZORPAY_KEY_ID);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Check if OpenAI API key is available
if (!process.env.OPENAI_API_KEY) {
  console.error('Warning: OpenAI API key is missing. Image generation will not work.');
  console.error('Make sure you have OPENAI_API_KEY defined in your .env file.');
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'placeholder_key_for_initialization',
});

console.log('OpenAI client initialized');

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.get('/', (_req, res) => {
  res.send('SpiritArt Alchemy API is running');
});

// Get user data
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await firebase.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error getting user data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update user
app.post('/api/user/create', async (req, res) => {
  try {
    const userData = req.body;

    if (!userData.id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Create or update user in Firebase
    const user = await firebase.createOrUpdateUser(userData);

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error creating/updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user transactions
app.get('/api/user/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const transactions = await firebase.getUserTransactions(userId);

    res.json({ transactions });
  } catch (error) {
    console.error('Error getting user transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user images
app.get('/api/user/:userId/images', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const images = await firebase.getUserImages(userId);

    res.json({ images });
  } catch (error) {
    console.error('Error getting user images:', error);
    res.status(500).json({ error: error.message });
  }
});

// Razorpay payment endpoint
app.post('/api/create-order', async (req, res) => {
  try {
    const { price, userId, credits } = req.body;

    // Create a new Razorpay order
    const options = {
      amount: price * 100, // Razorpay expects amount in paise (1 INR = 100 paise)
      currency: 'INR',
      receipt: `receipt_order_${Date.now()}`,
      notes: {
        userId: userId,
        credits: credits
      }
    };

    const order = await razorpay.orders.create(options);

    res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to verify Razorpay payment
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, credits, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Verify the payment signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature === razorpay_signature) {
      // Payment is successful
      console.log(`Payment successful for order ${razorpay_order_id}`);
      console.log(`Adding ${credits} credits to user ${userId}`);

      // Get user from Firebase
      let user = await firebase.getUserById(userId);

      // If user doesn't exist, create a new user
      if (!user) {
        user = await firebase.createOrUpdateUser({
          id: userId,
          credits: 0,
          createdAt: new Date()
        });
      }

      // Update user credits in Firebase
      const updatedCredits = await firebase.updateUserCredits(userId, credits);

      // Record the payment transaction
      await firebase.saveTransaction({
        userId,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: req.body.amount || 0, // Default to 0 if amount is not provided
        credits,
        type: 'purchase'
      });

      res.json({
        success: true,
        credits: updatedCredits
      });
    } else {
      // Payment verification failed
      res.status(400).json({ error: 'Payment verification failed' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload and transform image to Ghibli style
app.post('/api/upload-image', uploadMiddleware, async (req, res) => {
  console.log('Upload request received');
  console.log('Request body:', req.body);
  console.log('Request file:', req.file ? 'File present' : 'No file');
  if (req.file) {
    console.log('File details:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  }
  try {
    const { prompt, style, detailLevel, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!req.file) {
      console.error('No image file was uploaded');
      return res.status(400).json({ error: 'No image file was uploaded. Please select an image to transform.' });
    }

    console.log('File successfully uploaded and available at:', req.file.path);

    // Check if the file exists and has content
    try {
      const stats = fs.statSync(req.file.path);
      if (stats.size === 0) {
        console.error('Uploaded file is empty');
        return res.status(400).json({ error: 'The uploaded file is empty. Please select a valid image.' });
      }
    } catch (err) {
      console.error('Error checking uploaded file:', err);
      return res.status(400).json({ error: 'There was an issue with the uploaded file. Please try again.' });
    }

    // Get user from Firebase
    const user = await firebase.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has enough credits
    if (!user.credits || user.credits < 1) {
      return res.status(400).json({ error: 'Not enough credits' });
    }

    // Get the uploaded file path
    const uploadedFilePath = req.file.path;
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${path.basename(uploadedFilePath)}`;

    // Convert the image to PNG format and optimize it for DALL-E
    const pngFilePath = path.join(path.dirname(uploadedFilePath), `${path.parse(uploadedFilePath).name}.png`);

    try {
      try {
        // Process the image with sharp to convert to PNG with alpha channel (RGBA) and resize if needed
        await sharp(uploadedFilePath, { failOnError: false })
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .toColorspace('srgb') // Use standard RGB colorspace
          .ensureAlpha() // Ensure the image has an alpha channel (RGBA)
          .png({ quality: 90, force: true }) // Force PNG output
          .toFile(pngFilePath);

        // Log the image format for debugging
        const metadata = await sharp(pngFilePath).metadata();
        console.log('Image format details:', {
          format: metadata.format,
          channels: metadata.channels,
          space: metadata.space,
          hasAlpha: metadata.hasAlpha,
          width: metadata.width,
          height: metadata.height
        });
      } catch (sharpError) {
        console.error('Error processing image with Sharp:', sharpError);

        // Fallback: Just copy the file if Sharp processing fails
        console.log('Using fallback: copying original file');
        fs.copyFileSync(uploadedFilePath, pngFilePath);
      }

      console.log(`Image converted to PNG: ${pngFilePath}`);

      // Check file size
      const stats = fs.statSync(pngFilePath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      console.log(`PNG file size: ${fileSizeInMB.toFixed(2)} MB`);

      if (fileSizeInMB > 3.9) {
        try {
          // If still too large, compress further
          await sharp(pngFilePath, { failOnError: false })
            .resize({ width: 800, height: 800, fit: 'inside' })
            .toColorspace('srgb') // Use standard RGB colorspace
            .ensureAlpha() // Ensure the image has an alpha channel (RGBA)
            .png({ quality: 80, compressionLevel: 9, force: true }) // Force PNG output
            .toFile(pngFilePath + '.compressed.png');

          // Log the compressed image format for debugging
          const compressedMetadata = await sharp(pngFilePath + '.compressed.png').metadata();
          console.log('Compressed image format details:', {
            format: compressedMetadata.format,
            channels: compressedMetadata.channels,
            space: compressedMetadata.space,
            hasAlpha: compressedMetadata.hasAlpha,
            width: compressedMetadata.width,
            height: compressedMetadata.height
          });

          // Replace the original file with the compressed one
          fs.unlinkSync(pngFilePath);
          fs.renameSync(pngFilePath + '.compressed.png', pngFilePath);

          const newStats = fs.statSync(pngFilePath);
          console.log(`Compressed PNG file size: ${(newStats.size / (1024 * 1024)).toFixed(2)} MB`);
        } catch (compressionError) {
          console.error('Error compressing image with Sharp:', compressionError);
          console.log('Skipping compression due to error');

          // If the file is too large and compression fails, we'll still try to use it
          // DALL-E might reject it, but we'll let the API handle that error
        }
      }
    } catch (err) {
      console.error('Error processing image:', err);
      console.error('Error details:', err.message);
      console.error('Error stack:', err.stack);

      // Send a more detailed error message to help with debugging
      return res.status(400).json({
        error: 'Failed to process the uploaded image. Please try a different image.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        fileInfo: req.file ? {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path
        } : 'No file info available'
      });
    }

    // Get user prompt or use default
    const userPrompt = prompt || 'Transform this image into Studio Ghibli style';

    // Style-specific descriptions for Studio Ghibli transformation
    const styleGuide = {
      'ghibli-nature': 'Create a Studio Ghibli artwork in Hayao Miyazaki\'s distinctive style showing the exact same scene with hand-painted textures, soft pastel colors, and dreamy atmosphere like in "My Neighbor Totoro" or "Princess Mononoke"',
      'ghibli-character': 'Create a Studio Ghibli artwork in Hayao Miyazaki\'s distinctive style showing the exact same scene with simple rounded features, expressive eyes, and soft colors like in "Spirited Away" or "Kiki\'s Delivery Service"',
      'ghibli-cityscape': 'Create a Studio Ghibli artwork in Hayao Miyazaki\'s distinctive style showing the exact same scene with detailed architecture, warm lighting, and nostalgic atmosphere like in "Whisper of the Heart" or "From Up On Poppy Hill"',
      'ghibli-fantasy': 'Create a Studio Ghibli artwork in Hayao Miyazaki\'s distinctive style showing the exact same scene with magical elements, whimsical creatures, and ethereal lighting like in "Spirited Away" or "Howl\'s Moving Castle"'
    };

    // Create a base64 encoding of the image for GPT-4 Vision
    const imageBuffer = fs.readFileSync(pngFilePath);
    const base64Image = imageBuffer.toString('base64');

    console.log('Using GPT-4o mini with vision capabilities to analyze the uploaded image...');

    // Call GPT-4o mini with vision capabilities to describe the image in extreme detail
    const visionResponse = await openai.responses.create({
      model: "gpt-4o-mini", // Using the newer, more efficient model
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Analyze this image in extreme detail. List EXACTLY what is in the image - all objects, people, people's ages, hair types, scenery, colors, lighting, and composition. Be extremely specific about what is physically present in the image. This is critical for accurate image transformation."
          },
          {
            type: "input_image",
            image_url: `data:image/png;base64,${base64Image}`
          }
        ]
      }]
    });

    // Get the image description from GPT-4o mini
    // The response structure for the newer API
    const imageDescription = visionResponse.output_text;
    console.log('Image description from GPT-4o mini:', imageDescription);

    // Check if the vision model was unable to analyze the image properly
    if (imageDescription.startsWith('I\'m unable to analyze the image in detail as requested')) {
      console.log('Vision model unable to analyze image properly');
      return res.status(400).json({
        error: 'Our AI system could not properly analyze your image. Please try a different image with clearer content.',
        details: 'Vision model unable to process image details'
      });
    }

    // Create a very specific prompt for DALL-E 3 focused on Studio Ghibli style
    let finalPrompt = "";

    // Start with a clear instruction about what we want
    finalPrompt += "I want you to create a Studio Ghibli style artwork by Hayao Miyazaki based on this image description. ";

    // Add the image description from GPT-4o mini
    if (imageDescription) {
      // Extract the first 3-4 sentences for key content
      const sentences = imageDescription
      // .split('.')
      //   .filter(s => s.trim().length > 0)
      //   .slice(0, 4)
      //   .map(s => s.trim() + '.');

      finalPrompt += `The image shows: ${sentences
        // .join(' ')
      } `;
    }

    // Add the specific Studio Ghibli style instruction
    finalPrompt += `${styleGuide[style] || styleGuide['ghibli-nature']}. `;

    // Add user instructions if provided
    if (prompt && prompt.trim() !== '') {
      finalPrompt += `${userPrompt}. `;
    }

    // Add very specific Ghibli style references
    // finalPrompt += `IMPORTANT: This MUST be in the authentic Studio Ghibli style, specifically inspired by Hayao Miyazaki's direction. `;
    // finalPrompt += `Use these core visual characteristics: `;
    // finalPrompt += `1) Hand-painted, textured backgrounds with a watercolor or gouache feel, `;
    // finalPrompt += `2) Soft, natural pastel tones with occasional vibrant highlights for emphasis, `;
    // finalPrompt += `3) Stylized anime character design with gentle proportions and expressive, large eyes, `;
    // finalPrompt += `4) Emphasis on natural elements — detailed skies, wind-blown grass, trees, water reflections, and ambient light, `;
    // finalPrompt += `5) Whimsical, peaceful atmosphere with a sense of magic or quiet wonder, similar to films like 'My Neighbor Totoro' or 'Spirited Away'. `;
    // finalPrompt += `This must look like an actual animation frame captured from a Studio Ghibli film, complete with cinematic depth and painterly texture.`;


    // Truncate if needed
    const MAX_PROMPT_LENGTH = 950;
    if (finalPrompt.length > MAX_PROMPT_LENGTH) {
      console.log(`Prompt too long (${finalPrompt.length} chars). Truncating to ${MAX_PROMPT_LENGTH} chars.`);
      // finalPrompt = finalPrompt.substring(0, MAX_PROMPT_LENGTH) + '...';
    }

    console.log('Final prompt for DALL-E:', finalPrompt.substring(0, 100) + '...');

    // We're not using masks with the images.generate endpoint

    // Call OpenAI API with DALL-E 3 to generate a Studio Ghibli style image
    console.log('Calling OpenAI API with prompt:', finalPrompt.substring(0, 100) + '...');

    let response;
    try {
      // Use DALL-E 3 with a very specific prompt about Studio Ghibli style
      response = await openai.images.generate({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url",
      });

      console.log('OpenAI API response received successfully');
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      console.error('OpenAI error details:', openaiError.message);

      // Check if this is a file format error
      if (openaiError.message && openaiError.message.includes('Invalid input image')) {
        return res.status(400).json({
          error: 'The image format is not compatible with our AI system. Please try a different image.',
          details: openaiError.message
        });
      }

      // For other OpenAI errors
      return res.status(500).json({
        error: 'Error generating image with AI. Please try again or use a different image.',
        details: process.env.NODE_ENV === 'development' ? openaiError.message : undefined
      });
    }

    // No mask files to clean up with DALL-E 3

    // Check if we have a valid response
    if (!response || !response.data || !response.data[0] || !response.data[0].url) {
      console.error('Invalid response from OpenAI:', response);
      return res.status(500).json({
        error: 'Failed to generate image. The AI service returned an invalid response.',
        details: process.env.NODE_ENV === 'development' ? 'Missing image URL in response' : undefined
      });
    }

    // Get the image URL from the response
    const imageUrl = response.data[0].url;
    console.log('Image URL received from OpenAI');

    // Deduct 1 credit from the user's account
    const updatedCredits = await firebase.updateUserCredits(userId, -1);
    console.log(`Deducted 1 credit from user ${userId}. New credit balance: ${updatedCredits}`);

    // Save the generated image to Firebase
    const savedImage = await firebase.saveGeneratedImage({
      userId,
      prompt: userPrompt,
      enhancedPrompt: finalPrompt,
      imageDescription: imageDescription,
      originalImageUrl: fileUrl,
      style: style || 'ghibli-nature',
      detailLevel: detailLevel || 50,
      imageUrl
    });

    // Record the image generation transaction
    await firebase.saveTransaction({
      userId,
      imageId: savedImage.id,
      credits: -1,
      type: 'image-transformation',
      prompt: userPrompt
    });

    res.json({
      success: true,
      imageUrl,
      originalImageUrl: fileUrl,
      credits: updatedCredits,
      originalPrompt: userPrompt,
      enhancedPrompt: finalPrompt,
      imageDescription: imageDescription
    });
  } catch (error) {
    console.error('Error transforming image:', error);

    // Determine the appropriate status code and error message
    let statusCode = 500;
    let errorMessage = error.message || 'An unknown error occurred';

    // Check for specific error types
    if (error.status === 400) {
      statusCode = 400;
      // For prompt length errors
      if (errorMessage.includes('too long')) {
        errorMessage = 'The prompt was too long. Please try a shorter description.';
      }
      // For image format errors
      else if (errorMessage.includes('image must be a PNG') || errorMessage.includes('invalid_image_format')) {
        errorMessage = 'There was an issue with the image format. Please try a different image.';
      }
      // For invalid input image format
      else if (errorMessage.includes('Invalid input image') || errorMessage.includes('format must be')) {
        errorMessage = 'The image format is not compatible. Please try a different image with a simpler format.';
      }
      // For content policy violations
      else if (errorMessage.includes('content policy') || errorMessage.includes('safety')) {
        errorMessage = 'Your request was rejected due to content policy. Please try different instructions.';
      }
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    });
  }
});

// Generate image from text prompt with OpenAI - Not used anymore
// We're focusing only on image transformation
app.post('/api/generate-image', async (_req, res) => {
  // Return a message indicating this endpoint is no longer supported
  res.status(400).json({
    error: 'This endpoint is no longer supported. Please use /api/upload-image to transform your images to Ghibli style.'
  });
});

// No longer using the enhanced prompt function as we're keeping prompts simple and direct

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
