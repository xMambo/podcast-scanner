import React from 'react';
import { ClerkProvider, RedirectToSignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import SignInPage from './pages/SignInPage';

const frontendApi = process.env.REACT_APP_CLERK_FRONTEND_API;

const App = () => (
    <ClerkProvider frontendApi={frontendApi}>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/sign-in/*" element={<SignInPage />} />
                <Route
                    path="/dashboard"
                    element={
                        <SignedIn>
                            <Dashboard />
                        </SignedIn>
                    }
                />
                <Route
                    path="/dashboard"
                    element={
                        <SignedOut>
                            <RedirectToSignIn />
                        </SignedOut>
                    }
                />
            </Routes>
        </BrowserRouter>
    </ClerkProvider>
);

export default App;
