import mongoose, { Schema, Document } from "mongoose";

// No price field on cart items, structurally — same "can't leak/tamper what
// isn't stored" reasoning as Profile excluding role/tier. Price is ALWAYS
// re-resolved live from the current Listing at read and checkout time — never
// cached here, never accepted from the client.
export interface ICartItem {
  listingId: mongoose.Types.ObjectId;
  quantity: number;
}

export interface ICart extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  items: ICartItem[];
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true },
);

export const CartModel = mongoose.model<ICart>("Cart", cartSchema);
