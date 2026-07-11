import { BrowserRouter } from "react-router-dom";

export default function RouterProvider({
  children,
}) {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
}