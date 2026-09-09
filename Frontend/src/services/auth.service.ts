"use client";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { AuthOperations, type AuthSession } from "@/interfaces/auth";
import { firebaseAuth } from "@/config/firebase";
import { postApi } from "./apiClient.service";

const exchange = async (idToken: string, audience: "google" | "admin") => postApi<AuthSession>("/api/auth", { operation: AuthOperations.CreateSession, idToken, audience });
export const signInWithGoogle = async () => exchange(await (await signInWithPopup(firebaseAuth(), new GoogleAuthProvider())).user.getIdToken(), "google");
export const signInAdmin = async (email: string, password: string) => exchange(await (await signInWithEmailAndPassword(firebaseAuth(), email, password)).user.getIdToken(), "admin");
export const getSession = async () => postApi<AuthSession | null>("/api/auth", { operation: AuthOperations.GetSession });
export const signOutSession = async () => { await postApi<{ revoked: boolean }>("/api/auth", { operation: AuthOperations.RevokeSession }); await signOut(firebaseAuth()).catch(() => undefined); };
