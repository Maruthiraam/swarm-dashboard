import { useState } from "react";
import FaceAuth from "./FaceAuth";
import SwarmDashboard from "./SwarmDashboard";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  return authenticated
    ? <SwarmDashboard />
    : <FaceAuth onSuccess={() => setAuthenticated(true)} />;
}
