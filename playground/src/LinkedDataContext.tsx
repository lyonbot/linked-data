import * as React from "react";
import { LinkedData } from "@lyonbot/linked-data";

export const LinkedDataContext = React.createContext<LinkedData | null>(null);
