import { Types } from "mongoose";
import { AddressModel, IAddress } from "../models/address.model";

type IdLike = Types.ObjectId | string;

export class AddressNotFoundError extends Error {
  constructor() {
    super("Address not found");
    this.name = "AddressNotFoundError";
  }
}

// Explicit field allow-list — never spread client input into a Mongoose write,
// even after schema validation. userId and isDefault are set by the service.
const WRITABLE_FIELDS = [
  "label",
  "recipientName",
  "phone",
  "line1",
  "line2",
  "city",
  "district",
  "province",
  "postalCode",
] as const;

function pickWritable(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of WRITABLE_FIELDS) {
    if (input[f] !== undefined) out[f] = input[f];
  }
  return out;
}

// Clears the default flag on all of a user's OTHER addresses. Keeps the
// "at most one default" invariant in one place.
async function clearOtherDefaults(userId: IdLike, keepId: IdLike): Promise<void> {
  await AddressModel.updateMany({ userId, _id: { $ne: keepId }, isDefault: true }, { $set: { isDefault: false } });
}

export async function listAddresses(userId: IdLike): Promise<IAddress[]> {
  return AddressModel.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
}

export async function createAddress(userId: IdLike, input: Record<string, unknown>, makeDefault: boolean): Promise<IAddress> {
  // The very first address a user saves is their default regardless of input.
  const isFirst = (await AddressModel.countDocuments({ userId })) === 0;
  const isDefault = makeDefault || isFirst;

  const address = await AddressModel.create({ ...pickWritable(input), userId, isDefault });
  if (isDefault) await clearOtherDefaults(userId, address._id);
  return address;
}

// Ownership is enforced by scoping every query to {_id, userId} — a foreign id
// simply doesn't match, yielding a 404 (never a 403 that would confirm the id).
export async function updateAddress(userId: IdLike, addressId: IdLike, input: Record<string, unknown>, makeDefault?: boolean): Promise<IAddress> {
  const set = pickWritable(input);
  if (makeDefault === true) set.isDefault = true;

  const address = await AddressModel.findOneAndUpdate({ _id: addressId, userId }, { $set: set }, { new: true });
  if (!address) throw new AddressNotFoundError();
  if (address.isDefault) await clearOtherDefaults(userId, address._id);
  return address;
}

export async function deleteAddress(userId: IdLike, addressId: IdLike): Promise<void> {
  const deleted = await AddressModel.findOneAndDelete({ _id: addressId, userId });
  if (!deleted) throw new AddressNotFoundError();
  // If the default was removed, promote the most recent remaining address.
  if (deleted.isDefault) {
    const next = await AddressModel.findOne({ userId }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }
}
