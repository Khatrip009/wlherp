import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-primary-bg">
          <div className="text-center p-8 bg-white rounded-xl shadow max-w-md">
            <h1
              className="text-2xl font-bold text-accent-dark mb-2"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Something went wrong
            </h1>
            <p
              className="text-primary-dark mb-4"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="bg-primary hover:bg-primary-light text-white px-6 py-2 rounded transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}