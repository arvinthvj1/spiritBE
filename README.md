# SpiritArt Alchemy Backend Server

This is the backend server for SpiritArt Alchemy, handling Razorpay payments and OpenAI image generation.

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```

3. Update the `.env` file with your actual API keys:
   - Get your Razorpay API keys from the [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys)
   - Get your OpenAI API key from the [OpenAI Dashboard](https://platform.openai.com/account/api-keys)

4. Start the development server:
   ```
   npm run dev
   ```

## API Endpoints

### Razorpay Payment

- **POST /api/create-order**
  - Creates a Razorpay order for purchasing credits
  - Request body: `{ credits: number, price: number, userId: string }`
  - Response: `{ id: string, amount: number, currency: string, key: string }`

### Payment Verification

- **POST /api/verify-payment**
  - Verifies Razorpay payment signature
  - Request body: `{ razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string, credits: number }`
  - Response: `{ success: true, credits: number }` or error

### Image Generation

- **POST /api/generate-image**
  - Generates a Ghibli-style image using OpenAI's DALL-E
  - Request body: `{ prompt: string, style: string, detailLevel: number, userId: string }`
  - Response: `{ success: true, imageUrl: string }`

## Setting Up Razorpay

For local development:

1. Create a Razorpay account at [razorpay.com](https://razorpay.com/)
2. Go to the Dashboard > Settings > API Keys
3. Generate a test mode API key pair
4. Add the Key ID and Key Secret to your `.env` file
5. For production, generate a live mode API key pair

## Production Deployment

For production deployment:

1. Deploy the server to a hosting service (Heroku, Vercel, AWS, etc.)
2. Update the `FRONTEND_URL` in the `.env` file to your production frontend URL
3. Set up proper Stripe webhook endpoints in the Stripe Dashboard
4. Ensure all environment variables are properly set in your hosting environment
# spiritBE
