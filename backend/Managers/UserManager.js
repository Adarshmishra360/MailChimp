const Config = require('../config.json');
const admin = require("firebase-admin");
const { MongoClient } = require("mongodb");
const serviceAccount = require("../firebase_admin_privatekey.json");

class UserManager{

    constructor(){
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        this.loadDatabase();
    }

    async loadDatabase(){
        this.uri = Config.mongoUri;
        this.client = new MongoClient(this.uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        try{
            await this.client.connect();
            await this.client.db("MailMonk").command({ ping: 1 });
            this.db = this.client.db('MailMonk');
            console.log("Connected successfully to server: UserManager");
        }catch(ex){
            console.error('Error connecting to database(UserManager), ', ex);
        }
    }

    // lastMailViews, lastMailRecepients, activeCampaigns, totalMails 
    async GetDashboard(userId){
        let result = {};

        try{
            let mails = this.db.collection("MailReceipt").find({userId: userId});
            result['totalMails'] = await mails.count();
            let lastMailCursor = this.db.collection("MailReceipt").find({userId: userId, status: "completed"}, {sort: {time: -1}, limit: 1, projection: {views: 1, successList: 1}});
            let lastMail = await lastMailCursor.toArray();
            if(lastMail && lastMail.length > 0){
                lastMail = lastMail[0];
                result['lastMailViews'] = lastMail.views;
                result['lastMailRecepientsCount'] = lastMail.successList.length;
            }else{
                result['lastMailViews'] = 0;
                result['lastMailRecepients'] = 0;
            }
            let activeCampaignsCursor = this.db.collection("Campaigns").find({userId: userId, status: "running"});
            result['activeCampaigns'] = await activeCampaignsCursor.count();
        }catch(ex){
            console.log('Error in GetDashboard');
            
            result['lastMailViews'] = 0;
            result['lastMailRecepientsCount'] = 0;
            result['lastMailViews'] = 0;
            result['lastMailRecepients'] = 0;
        }
        return result;
    }

    // returns an object UserAuth with properties:
    //  loggedIn, isNewUser, email, userId
    async VerifyUser(req, res, next){
        let authHeader = req.headers.authorization;
        res.setHeader("Access-Control-Allow-Origin", "*");
        if(!authHeader || !authHeader.startsWith('Bearer')){
            res.status(401).send("UnAuthorized: Token not found");
            return;
        }

        let idToken = authHeader.substr(7, authHeader.length - 7);
        try{
            let user = await admin.auth().verifyIdToken(idToken);
            if(user.email && user.uid){
                let userDetails = await this.db.collection("Users").findOne({userId: user.uid});
                let response = {
                    email: user.email,
                    uid: user.uid,
                    isNewUser: false
                };
                if(userDetails == null){
                    // new user, we'll create one
                    userDetails = {
                        userId: user.uid,
                        joined: new Date().getTime(),
                        email: user.email,
                    };
                    await this.db.collection("Users").insertOne(userDetails);
                    response['isNewUser'] = true;
                }
                
                res.locals.UserAuth = response;
                next();
            }else{
                res.status(401).send("UnAuthorized: Cannot verify token(1)");
            }
        }catch(err){
            res.status(401).send("UnAuthorized: Cannot verify token(2)");
            console.log('Error Verifying user: ', err);
        }
    }
}

module.exports = UserManager;
