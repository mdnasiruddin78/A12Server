require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPTE_SECRET_KEY)
const port = process.env.PORT || 5000
const app = express()

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://forum-online-server.vercel.app',
    'https://zingy-sunshine-2e5cd3.netlify.app',
  ],
  credentials: true,
}))
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.faeap.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("blogsOnlineDb").collection("users");
    const announceCollection = client.db("blogsOnlineDb").collection("announcement");
    const postCollection = client.db("blogsOnlineDb").collection("userPost");
    const tagCollection = client.db("blogsOnlineDb").collection("tags");
    const commentCollection = client.db("blogsOnlineDb").collection("comment");
    const paymentCollection = client.db("blogsOnlineDb").collection("payments");
    const reportCollection = client.db("blogsOnlineDb").collection("reportFeedback");
    const restrictionCollection = client.db("blogsOnlineDb").collection("restriction");

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET)
      res.send({ token });
    })

    // middlewares verifyToken
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    // verifyAdmin 
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // users related apis
    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user dosent exist
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user alrady exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    // get all users
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const search = req.query.search
      let query = {
        email: {
          $regex: search || '',
          $options: 'i',
        }
      }
      const result = await userCollection.find(query).toArray();
      res.send(result)
    })

    // user get by email
    app.get('/singleUser/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await userCollection.findOne(query)
      res.send(result)
    })

    // isAdmin route
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' })
      }
      const query = { email: email }
      const user = await userCollection.findOne(query);
      let admin = false
      if (user) {
        admin = user.role === 'admin';
      }
      res.send({ admin })
    })

    // make a admin
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          role: 'admin',
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })

    // admin delete a user 
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })

    // announcement upload
    app.post('/announcement', verifyToken, verifyAdmin, async (req, res) => {
      const notification = req.body;
      const result = await announceCollection.insertOne(notification)
      res.send(result)
    })

    // announcement read
    app.get('/announcement', async (req, res) => {
      const result = await announceCollection.find().sort({ '_id': -1 }).toArray()
      res.send(result)
    })

    // users add post
    app.post('/addPost', async (req, res) => {
      const userPost = req.body;
      const result = await postCollection.insertOne(userPost);
      res.send(result)
    })

    // user add data get
    app.get('/addPost', async (req, res) => {
      const search = req.query.search
      let query = {
        tag: {
          $regex: search || '',
          $options: 'i',
        }
      }
      const result = await postCollection.find(query).sort({ '_id': -1 }).toArray()
      res.send(result)
    })

    // cardDetails by id
    app.get('/addPost/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await postCollection.findOne(query)
      res.send(result)
    })

    // add post data get by email only(3)
    app.get('/emailLimit/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await postCollection.find(query).sort({ '_id': -1 }).limit(3).toArray()
      res.send(result)
    })

    // add post data get by email
    app.get('/addEmail/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await postCollection.find(query).toArray()
      res.send(result)
    })

    // delete post by email
    app.delete('/addEmail/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await postCollection.deleteOne(query)
      res.send(result)
    })

    // admin add tags post 
    app.post('/addTags', verifyToken, async (req, res) => {
      const tags = req.body;
      const result = await tagCollection.insertOne(tags)
      res.send(result)
    })

    // admin add tags get
    app.get('/addTags', async (req, res) => {
      const result = await tagCollection.find().toArray()
      res.send(result)
    })

    // comment post 
    app.post('/allComment', async (req, res) => {
      const commentInfo = req.body;
      const result = await commentCollection.insertOne(commentInfo)
      const id = req.body.postId
      const main = req.body.commentCount
      const query = {
        _id: new ObjectId(id)
      }
      const updatedDocument = {
        $set: {
          commentCount: main
        }
      }
      const patchResult = await postCollection.updateOne(query, updatedDocument)
      // kag baki
      res.send({ result, patchResult })
    })

    app.get('/allComment', async (req, res) => {
      const result = await commentCollection.find().toArray()
      res.send(result)
    })

    app.get('/allComment/:postId', async (req, res) => {
      const postId = req.params.postId;
      const query = { postId: postId }
      const result = await commentCollection.find(query).toArray()
      res.send(result)
    })

    // votecoutn patch route
    app.patch('/voteCount/:id', async (req, res) => {
      const id = req.params.id;
      const voteInfo = req.body;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          vote: voteInfo.vote
        }
      }
      const result = await postCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })

    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      const userUpdate = await userCollection.updateOne({ email: payment.email }, {
        $set: {
          status: 'member',
          badge: 'Gold',
        }
      })
      res.send(paymentResult);
    })

    // member get by email
    app.get('/payments/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })

    // report feedback comment
    app.post('/feedback', verifyToken, async (req, res) => {
      const repot = req.body;
      const result = await reportCollection.insertOne(repot)
      res.send(result)
    })

    // report feedback comment get
    app.get('/feedback', verifyToken, verifyAdmin, async (req, res) => {
      const result = await reportCollection.find().toArray()
      res.send(result)
    })

    app.get('/filter/:email',verifyToken,verifyAdmin,async(req,res) => {
      const reportEmail = req.params.email;
      const query = {reportEmail: reportEmail}
      const result = await reportCollection.findOne(query)
      res.send(result)
    })

    // restriction message post
    app.post('/restrictionMessage', verifyToken,verifyAdmin, async (req, res) => {
      const message = req.body;
      const result = await restrictionCollection.insertOne(message)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Blog Online Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))