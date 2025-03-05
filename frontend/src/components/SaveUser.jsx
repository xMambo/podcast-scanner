import { useEffect } from 'react';
import axios from 'axios';
import { useUser } from '@clerk/clerk-react';

const SaveUser = () => {
    const { user } = useUser();

    const saveUser = async () => {
        if (!user) return;

        try {
            const response = await axios.post("http://localhost:5000/api/save-user", {
                id: user.id,
                fullName: user.fullName,
                email: user.primaryEmailAddress.emailAddress,
            });

            console.log("User saved successfully:", response.data);
        } catch (error) {
            console.error("❌ Failed to save user:", error);
        }
    };

    // Run on mount
    useEffect(() => {
        saveUser();
    }, [user]);

    return null;  // No UI needed
};

export default SaveUser;
