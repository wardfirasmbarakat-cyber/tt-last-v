const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `// Import Views
import TableSelectScreen from "./components/TableSelectScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import MenuView from "./components/MenuView";
import AiWaiterChat from "./components/AiWaiterChat";
import CartAndOrdering from "./components/CartAndOrdering";
import TableActions from "./components/TableActions";
import ReviewsView from "./components/ReviewsView";
import StaffDashboard from "./components/StaffDashboard";
import ThankYouScreen from "./components/ThankYouScreen";`;

const replacement = `// Import Views
import TableSelectScreen from "./components/TableSelectScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import ThankYouScreen from "./components/ThankYouScreen";

// Lazy Loaded Views for Code Splitting & Performance Optimization
const MenuView = React.lazy(() => import("./components/MenuView"));
const AiWaiterChat = React.lazy(() => import("./components/AiWaiterChat"));
const CartAndOrdering = React.lazy(() => import("./components/CartAndOrdering"));
const TableActions = React.lazy(() => import("./components/TableActions"));
const ReviewsView = React.lazy(() => import("./components/ReviewsView"));
const StaffDashboard = React.lazy(() => import("./components/StaffDashboard"));`;

code = code.replace(target, replacement);

fs.writeFileSync('src/App.tsx', code);
