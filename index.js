const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { query } = require('express');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = 5000 || process.env.PORT;

const app = express();

//Middleware
app.use(cors());
app.use(express.json());

//Database Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nvyyp05.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// Verify Token
function verifyJWT(req, res, next){
    const authHeader = req.headers.authorization;
    console.log(authHeader)
    if(!authHeader){
        res.status(401).send('Unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    console.log(token)
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if(err){
            res.status(403).send('Forbidden access');
        }
        req.decoded = decoded;
        next();
    });
}

//API 
async function run() {
    try{
        const categoriesCollection = client.db("copshop").collection("categories");
        const productsCollection = client.db("copshop").collection("products");
        const usersCollection = client.db("copshop").collection("users");
        const ordersCollection = client.db("copshop").collection("orders");
        const paymentsCollection = client.db("copshop").collection("payments");

        // Get All Categories
        app.get('/categories', async (req, res) => {
            let query = {};
            const categories = await categoriesCollection.find(query).toArray();
            res.send(categories);
        });

        // Get One Category
        app.get('/categories/:id', async (req, res) => {
            let query = { _id: ObjectId(req.params.id) };
            const category = await categoriesCollection.findOne(query);
            res.send(category);
        });

        // Get Products
        app.get('/products/:category', async (req, res) => {
            const category = req.params.category;
            let query = {};
            if(category){
                query = {category: category};
            };
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        });

        // Get Advertised Products
        app.get('/advertisedproducts', async (req, res) => {
            let query = { advertise: true };
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        });

        // Get Products By Email
        app.get('/products', async (req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const products = await productsCollection.find(query).toArray();
            res.send(products);
        });

        // Add Product
        app.post('/products', async (req, res) => {
            const product = req.body;
            const result = await productsCollection.insertOne(product);
            res.json(result);
        });

        // Update Product with to Advertise
        app.put('/products/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const product = req.body;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true };
            const newValues = { $set: {advertise: true} };
            const result = await productsCollection.updateOne(query, newValues, options);
            res.send(result);
        });

        // Check if user is Admin
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = {email};
            const user = await usersCollection.findOne(query);
            res.send({isAdmin: user?.role === 'admin'});
        });

        // Check if user is Seller
        app.get('/users/seller/:email', async (req, res) => {
            const email = req.params.email;
            const query = {email};
            const user = await usersCollection.findOne(query);
            res.send({isSeller: user?.role === 'seller'});
        });

        // Check if user is Buyer
        app.get('/users/buyer/:email', async (req, res) => {
            const email = req.params.email;
            const query = {email};
            const user = await usersCollection.findOne(query);
            res.send({isBuyer: user?.role === 'buyer'});
        });

        // Integrate Stripe
        app.post('/create-payment-intent', async (req, res) => {
            console.log(req.body);
            const order = req.body;
            const amount = order.price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            });
        });

        // Post Payment
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const orderId = payment.orderId;
            const orderFilter = { _id: ObjectId(orderId) };
            const updatedOrderDoc = {
                $set: {
                    paid: true,
                    paymentId: payment.paymentId,
                },
            };
            const updatedOrderResult = await ordersCollection.updateOne(orderFilter, updatedOrderDoc);
            const productId = payment.productId;
            const productFilter = { _id: ObjectId(productId) };
            const updatedProductDoc = {
                $set: {
                    advertise: false,
                    sold: true,
                },
            };
            const options = { upsert: true };
            const updatedProductResult = await productsCollection.updateOne(productFilter, updatedProductDoc, options);
            res.send(result);
        });

        // JWT
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1d'});
                return res.send({accessToken: token});
            }
            console.log(user);
            res.status(403).send({accessToken: ''});
        });

        // Get All Buyers
        app.get('/buyers', async (req, res) => {
            const query = {role: 'buyer'};
            const buyers = await usersCollection.find(query).toArray();
            res.send(buyers);
        });

        // Get All Sellers
        app.get('/sellers', async (req, res) => {
            const query = {role: 'seller'};
            const sellers = await usersCollection.find(query).toArray();
            res.send(sellers);
        });
        
        // Post User
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.json(result);
        });

        // Get User
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            res.send(user);
        });

        // Verify User
        app.put('/admin/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true };
            const newValues = { $set: {verifiedUser: true} };
            const result = await usersCollection.updateOne(query, newValues, options);
            res.send(result);
        });

        // Delete User
        app.delete('/admin/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.json(result);
        });

        // Post Order
        app.post('/orders', async (req, res) => {
            const order = req.body;
            const query = {buyerEmail: order.buyerEmail, title: order.title};
            const previousOrder = await ordersCollection.findOne(query);
            if(previousOrder){
                res.json({message: 'Order already exists'});
            }
            else{
                const result = await ordersCollection.insertOne(order);
                res.json(result);
            }
        });

        // Get Orders
        app.get('/orders/:email', async (req, res) => {
            const email = req.params.email;
            const query = {buyerEmail: email};
            const orders = await ordersCollection.find(query).toArray();
            res.send(orders);
        });

        // Get One Order by ID for Payment
        app.get('/orders/payment/:id', async (req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const order = await ordersCollection.findOne(query);
            res.send(order);
        });

        // Report item
        app.put('/reportItem/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true };
            const newValues = { $set: {report: true} };
            const result = await productsCollection.updateOne(query, newValues, options);
            res.send(result);
        });

        // Get Reported Items
        app.get('/reportedItems', async (req, res) => {
            const query = {report: true};
            const reportedItems = await productsCollection.find(query).toArray();
            res.send(reportedItems);
        });

        // Delete Reported Item
        app.delete('/reportedItems/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            res.json(result);
        });
    }
    finally{

    }
}

run().catch(console.log);

app.get('/', (req, res) => {
    res.send('Server is up');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});