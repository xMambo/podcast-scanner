import express from 'express';
import User from '../models/User.js';  // Adjust the path if needed

const router = express.Router();

router.post("/save-user", async (req, res) => {  // No /api prefix here
    console.log("Received request to save user:", req.body);

    try {
        const { id, fullName, email } = req.body;

        let user = await User.findOne({ id });
        if (user) {
            console.log("User already exists:", user);
            return res.status(200).json(user);
        }

        user = new User({ id, fullName, email });
        await user.save();
        console.log("User saved:", user);

        res.status(201).json(user);
    } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
