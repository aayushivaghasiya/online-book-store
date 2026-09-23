# BookNest — Premium Online Book Store

A complete responsive WAD project using HTML, CSS, JavaScript, Node.js and Express.

## Features
- Responsive desktop/tablet/mobile design
- Mobile hamburger menu that closes after every option and outside click
- 28 books across multiple categories
- Search, category filters and sorting
- Like/favorite books after login
- Sign up with name, email and password
- Login using the same account credentials
- Logout
- User name shown in the header after login
- Login required before cart/purchase actions
- Shopping cart with quantity controls
- Checkout with UPI, Card and Cash on Delivery UI
- Successful order confirmation with order ID
- Personal order history
- Return / Exchange request
- Inventory stock validation
- Admin inventory viewer at `/admin`
- Data stored in JSON files for this educational project

## Run locally
```bash
npm install
npm start
```
Open: http://localhost:10000

## Render
Build Command: `npm install`
Start Command: `npm start`
The service automatically uses Render's `PORT` environment variable.

## Important
This is an educational/demo e-commerce project. The payment methods are UI/demo flows and do not process real payments.


### Cover display fix
All product cover frames use a fixed height and `object-fit: contain` so the complete real cover is visible without cropping, while all cards remain the same size. Book details, rating, price and Add to Cart remain below the cover.
