import { Types } from "mongoose";
import { ProfileModel, IProfile } from "../models/profile.model";
import { IUser } from "../models/user.model";

// Explicit field list even though req.validatedBody is already strict-
// schema-limited — never spread a request-derived object into a Mongoose
// write, even a validated one.
const ALLOWED_FIELDS = ["displayName", "bio", "location"] as const;

export async function getOrCreateProfile(userId: Types.ObjectId): Promise<IProfile> {
  let profile = await ProfileModel.findOne({ userId });
  if (!profile) {
    profile = await ProfileModel.create({ userId });
  }
  return profile;
}

export async function updateProfile(userId: Types.ObjectId, patch: Record<string, unknown>): Promise<IProfile | null> {
  const set: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (patch[field] !== undefined) {
      set[field] = patch[field];
    }
  }

  return ProfileModel.findOneAndUpdate(
    { userId },
    { $set: set, $setOnInsert: { userId } },
    { new: true, upsert: true },
  );
}

export async function setAvatarPath(userId: Types.ObjectId, avatarPath: string): Promise<IProfile | null> {
  return ProfileModel.findOneAndUpdate(
    { userId },
    { $set: { avatarPath }, $setOnInsert: { userId } },
    { new: true, upsert: true },
  );
}

// Two separate serializers, not one with a delete()-on-the-way-out flag —
// a forgotten flag is a data leak; a wrong import is a compile-time mistake.

// For viewing someone else's profile — no identity/privilege fields, ever.
export function serializePublicProfile(profile: IProfile) {
  return {
    id: profile.userId,
    displayName: profile.displayName,
    bio: profile.bio,
    location: profile.location,
    hasAvatar: Boolean(profile.avatarPath),
  };
}

// Only for the profile's own owner — identity fields come from the User
// doc, never from client input.
export function serializePrivateProfile(profile: IProfile, user: IUser) {
  return {
    id: profile.userId,
    displayName: profile.displayName,
    bio: profile.bio,
    location: profile.location,
    hasAvatar: Boolean(profile.avatarPath),
    email: user.email,
    role: user.role,
    sellerTier: user.sellerTier,
    sellerApplicationStatus: user.sellerApplicationStatus,
    mfaEnabled: user.mfaEnabled,
    emailVerified: user.emailVerified,
  };
}
