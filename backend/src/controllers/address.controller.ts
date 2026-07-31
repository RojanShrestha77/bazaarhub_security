import { Request, Response, NextFunction } from "express";
import {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  AddressNotFoundError,
} from "../services/address.service";
import { AddressCreateDto, AddressUpdateDto } from "../validators/address.schema";
import { IAddress } from "../models/address.model";

function serialize(a: IAddress) {
  return {
    id: a._id,
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    district: a.district,
    province: a.province,
    postalCode: a.postalCode,
    isDefault: a.isDefault,
    createdAt: a.createdAt,
  };
}

export class AddressController {
  private handleError(err: unknown, res: Response, next: NextFunction) {
    if (err instanceof AddressNotFoundError) return res.status(404).json({ error: err.message });
    next(err);
  }

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const addresses = await listAddresses(req.user!._id);
      return res.status(200).json({ addresses: addresses.map(serialize) });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as AddressCreateDto;
      const address = await createAddress(req.user!._id, body, Boolean(body.isDefault));
      return res.status(201).json(serialize(address));
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.validatedBody as AddressUpdateDto;
      const address = await updateAddress(req.user!._id, req.params.id, body, body.isDefault);
      return res.status(200).json(serialize(address));
    } catch (err) {
      this.handleError(err, res, next);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteAddress(req.user!._id, req.params.id);
      return res.status(204).end();
    } catch (err) {
      this.handleError(err, res, next);
    }
  };
}
