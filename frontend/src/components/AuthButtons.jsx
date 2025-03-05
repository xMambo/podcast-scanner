import { SignInButton, SignOutButton, useUser } from '@clerk/clerk-react';

const AuthButtons = () => {
    const { isSignedIn, user } = useUser();

    if (isSignedIn) {
        return (
            <div>
                <p>Welcome, {user.fullName}!</p>
                <SignOutButton />
            </div>
        );
    } else {
        return <SignInButton />;
    }
};

export default AuthButtons;
