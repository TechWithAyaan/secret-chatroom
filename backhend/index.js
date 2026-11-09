import express from "express";
import dotenv from "dotenv"
import mongoose from "mongoose"
import Message from "./models/messageSchem.js";
import cors from "cors";
import dns from "dns";
const app = express()

app.use(cors())


app.use(express.json());
dns.setServers([
    "8.8.8.8",
    "1.1.1.1"
]);

dotenv.config({ path: "./.env" });
dotenv.config()
console.log("M VALUE:", process.env.MONGO_URI);
// console.log("ALL ENV:", process.env);

console.log("MONGO:", process.env.MONGO_URI);


 const connectDb = async () =>{
    try {
     await mongoose.connect(process.env.MONGO_URI)
        console.log("Connected to MongoDB" + process.env.MONGO_URI)
    } catch (error) {
        console.error("Error connecting to MongoDB:", error)
    }
}

app.get("/", (req,res) =>{
    res.status(200).send("Hello from backend")
})

app.post("/api", async (req,res) =>{

        const message = new Message({
        message: req.body.message
    })
await message.save()
    res.send({
        message :"message sent sucessfully",
        data: message
    })

})

app.get("/api", async (req,res) =>{
    try {
        const messages = await Message.find()
        res.status(200).json(messages)
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
})

app.listen(5000,()=>{
    console.log(`Server is running on port 5000`)
    connectDb()
})