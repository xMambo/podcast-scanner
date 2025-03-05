// /src/pages/SignInPage.jsx

import { SignIn } from '@clerk/clerk-react';

const SignInPage = () => (
    <div>
        <h2>Sign In</h2>
        <SignIn routing="path" path="/sign-in" />
    </div>
);

export default SignInPage;
