import { Redirect } from 'expo-router';

/** New orders are pasted on the Home screen now. Old links to /new go there. */
export default function NewOrder() {
  return <Redirect href="/" />;
}
