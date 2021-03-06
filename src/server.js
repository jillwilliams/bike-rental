const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const Sequelize = require('sequelize')
const epilogue = require('epilogue')
const OktaJwtVerifier = require('@okta/jwt-verifier')
const Nexmo = require('nexmo')
const config = require('../config')
const path = require('path')
const PORT = process.env.PORT || 8081

const nexmo = new Nexmo({
  apiKey: config.API_KEY,
  apiSecret: config.API_SECRET
}, {debug: true})

const oktaJwtVerifier = new OktaJwtVerifier({
  clientId: '0oafw2m5winCaBnXv0h7',
  issuer: 'https://dev-563731.oktapreview.com/oauth2/default'
})

let app = express()
let database
app.use(express.static(path.join(__dirname, '../dist')))
app.use(cors())
app.use(bodyParser.json())

app.post('/send-sms', (req, res) => {
  const toNumber = req.body.number
  const text = req.body.text
  nexmo.message.sendSms(
    config.NUMBER, toNumber, text, {type: 'unicode'},
    (err, data) => {
      if (err) {
        console.log(err)
      } else {
        res.send(data)
        // Optional: add socket.io -- will explain later
      }
    }
  )
})

// verify JWT token middleware
const authRequired = () => {
  return (req, res, next) => {
    if (!req.headers.authorization) {
      return next(new Error('Authorization header is required'))
    }
    let parts = req.headers.authorization.trim().split(' ')
    let accessToken = parts.pop()
    oktaJwtVerifier.verifyAccessToken(accessToken)
      .then(jwt => {
        req.user = {
          uid: jwt.claims.uid,
          email: jwt.claims.sub
        }
        next()
      })
      .catch(next) // jwt did not verify!
  }
}

app.get('/', authRequired(), (req, res) => {
  return res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// // route uses authRequired middleware to secure it
// app.get('/api', authRequired(), (req, res) => {
//   return res.json({
//     secret: 'The answer is always "A"!'
//   })
// })

// app.use('/', (req, res) => {
//   res.sendFile(path.join(__dirname, '../dist'))
// })

if (process.env.DATABASE_URL) {
  database = new Sequelize(process.env.DATABASE_URL)
} else {
  database = new Sequelize({
    host: 'localhost',
    dialect: 'postgres',
    operatorsAliases: false,

    pool: {
      max: 5,
      min: 0,
      idle: 10000
    }
  })
}
database
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.')
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err)
  })

// Define our Share model
// id, createdAt, and updatedAt are added by sequelize automatically
let Share = database.define('shares', {
  costToRent: Sequelize.INTEGER,
  uploadedPicture: Sequelize.TEXT,
  shortDescription: Sequelize.STRING,
  longDescription: Sequelize.TEXT,
  bikeType: Sequelize.STRING,
  address: Sequelize.STRING,
  lat: Sequelize.DECIMAL,
  lng: Sequelize.DECIMAL,
  dateOne: Sequelize.DATE,
  dateTwo: Sequelize.DATE,
  isRented: Sequelize.BOOLEAN,
  isPaid: Sequelize.BOOLEAN
})

let oktaUser = database.define('bikes', {
  userId: Sequelize.STRING,
  ownedBikes: Sequelize.TEXT,
  rentedBikes: Sequelize.TEXT
})

// Initialize epilogue
epilogue.initialize({
  app: app,
  sequelize: database
})

// Create the dynamic REST resource for our Share model
let shareResource = epilogue.resource({
  model: Share,
  endpoints: ['/shares', '/shares/:id'],
  sort: {
    param: 'orderby',
    attributes: [ 'bikeType' ]
  }
})
// Resets the database and launches the express app on :8081
database
  .sync({ force: false })
  .then(() => {
    app.listen(PORT, () => {
      console.log('listening to port localhost:' + PORT)
    })
  })
