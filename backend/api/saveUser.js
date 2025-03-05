import express from "express";
import User from "../models/User.js";  // Ensure this path is correct
import mongoose from "mongoose";

const router = express.Router();

// ✅ Save or Update User
router.post("/save-user", async (req, res) => {
    console.log("Received request to save user:", req.body);

    const { id, fullName, email } = req.body;

    // ✅ Input Validation
    if (!id || !fullName || !email) {
        console.error("❌ Missing required fields:", req.body);
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // ✅ Upsert User (Create if not exists, update if exists)
        const user = await User.findOneAndUpdate(
            { id },  // Find by `id` field
            { id, fullName, email },  // Update data
            { new: true, upsert: true }  // Return updated doc & create if missing
        );

        console.log("✅ User saved or updated:", user);
        res.status(201).json(user);
    } catch (error) {
        console.error("❌ Error saving user:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
