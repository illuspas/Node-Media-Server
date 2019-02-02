# RADIANT NODE MEDIA SERVER

## Configuration

.env file in base project directory like `Node-Media-Server/.env`

example

```
  AWS_ACCESS_KEY="key"
  AWS_SECRET_ACCESS_SECRET="secret"
  S3_BUCKET="bucket"
  RADIANT_BACKEND_LOCAL_SERVER="localhost:4000/App/graphql"
  DEV_RADIANT_BACKEND_SERVER="backendUrl"
  HTTPS_PORT=8443
  HTTP_PORT=8000
  RTMP_PORT=1935
  ENV="LOCAL"
  
```

## Running Server

`npm start` or `node app.js`

## Using Server

### RTMP UP

javascript example signing url
```
// server
const expiration2 = moment().add(5, 'minutes').unix();
const userId = 123;
const token = JWT web token
const conversationId = asdrrvew;
const HashValue2 = MD5(`/radiant/${userId}-${expiration2}-${config.auth.secret}`);
console.log(`Expiration Value = ${expiration2} = ${moment.unix(expiration2)}`);
console.log(`Hash Value = ${HashValue2.toString()}`);
console.log(`Request Address looks like = rtmp://media.server.url/radiant/${userId}?sign=${expiration2}-${HashValue2}&token=${token}&conversationId=${conversationId}`);

```

example of how your publishing url should look.

```
rtmp://localhost/radiant/123?sign=1549059252-84c5c395681132c0cb3d7687d58cf38b
=conversationTopicId=123&token=84c5c395681132c0cb3d7687d58cf38b
```

 #### Anatomy of our RTMP URL
 
 rtmp = Real-Time Messaging Protocol [rtmp](https://en.wikipedia.org/wiki/Real-Time_Messaging_Protocol)  

 radiant = app specific streams.  ie we could have other apps that use real time streaming ie `womankind`
 
 123 = the userId of the person logged into the ios / android app
 
 URL Parameters:

`sign` = security part of our url.. prevents from having just anyone start publishing their video.

`conversationTopicId` = this allows us to link the video to the appropriate relationships in the database

`token` = JWT token need to allow us to connect to radiant backend

With the same url someone can watch the stream as its still live.  