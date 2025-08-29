import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { PlusCircle, Edit, Trash2, DollarSign, XCircle, Loader, Sparkles } from 'lucide-react';

// Environment variables provided by the platform
const firebaseConfig = typeof _firebase_config !== 'undefined' ? JSON.parse(_firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialize Firebase
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

const App = () => {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);

  // State for the subscription tracker features
  const [subscriptions, setSubscriptions] = useState([]);
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0);
  const [totalYearlyCost, setTotalYearlyCost] = useState(0);
  const [formName, setFormName] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formCycle, setFormCycle] = useState('monthly');
  const [editingId, setEditingId] = useState(null);
  
  // New state for Gemini API response
  const [geminiResponse, setGeminiResponse] = useState(null);

  useEffect(() => {
    // Handle user authentication with Firebase
    let authUnsubscribe;
    if (auth) {
      authUnsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
            await signInAnonymously(auth);
          }
        }
        setUserId(auth.currentUser?.uid || 'anonymous');
        setIsAuthReady(true);
      });
    }

    // Clean up the auth listener when the component unmounts
    return () => {
      if (authUnsubscribe) authUnsubscribe();
    };
  }, []);

  // Effect to handle real-time data from Firestore
  useEffect(() => {
    if (isAuthReady && userId && db) {
      const subscriptionsPath = artifacts/${appId}/users/${userId}/subscriptions;
      const q = collection(db, subscriptionsPath);

      // Set up a real-time listener to automatically get updates
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const subscriptionsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setSubscriptions(subscriptionsList);

        // Recalculate total cost
        let calculatedMonthlyTotal = 0;
        let calculatedYearlyTotal = 0;

        subscriptionsList.forEach(sub => {
          let monthlyCost = sub.cost;
          let yearlyCost = sub.cost;

          if (sub.cycle === 'yearly') {
            monthlyCost = sub.cost / 12;
          } else if (sub.cycle === 'monthly') {
            yearlyCost = sub.cost * 12;
          }
          calculatedMonthlyTotal += monthlyCost;
          calculatedYearlyTotal += yearlyCost;
        });

        setTotalMonthlyCost(calculatedMonthlyTotal);
        setTotalYearlyCost(calculatedYearlyTotal);
      }, (err) => {
        console.error("Firestore error:", err);
        setError("Failed to load subscriptions from the database.");
      });

      return () => unsubscribe();
    }
  }, [isAuthReady, userId]);

  // Function to handle adding or updating a subscription
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formName || !formCost) {
      setError('Please fill in both the name and cost.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const subscriptionsRef = collection(db, artifacts/${appId}/users/${userId}/subscriptions);
      const newSubscription = {
        name: formName,
        cost: parseFloat(formCost),
        cycle: formCycle,
        createdAt: new Date(),
      };

      if (editingId) {
        // Update existing subscription
        const subDoc = doc(db, artifacts/${appId}/users/${userId}/subscriptions, editingId);
        await updateDoc(subDoc, newSubscription);
        setMessage('Subscription updated successfully!');
      } else {
        // Add new subscription
        await addDoc(subscriptionsRef, newSubscription);
        setMessage('Subscription added successfully!');
      }

      // Reset form and UI states
      setFormName('');
      setFormCost('');
      setFormCycle('monthly');
      setEditingId(null);
    } catch (err) {
      console.error("Error saving subscription:", err);
      setError('Failed to save subscription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Function to start editing a subscription
  const startEdit = (sub) => {
    setFormName(sub.name);
    setFormCost(sub.cost);
    setFormCycle(sub.cycle);
    setEditingId(sub.id);
  };

  // Function to delete a subscription
  const handleDelete = async (id) => {
    setLoading(true);
    setError('');
    try {
      const subDoc = doc(db, artifacts/${appId}/users/${userId}/subscriptions, id);
      await deleteDoc(subDoc);
      setMessage('Subscription deleted successfully!');
    } catch (err) {
      console.error("Error deleting subscription:", err);
      setError('Failed to delete subscription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // New function to generate a Gemini report
  const generateGeminiReport = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setGeminiResponse(null);

    const subscriptionsText = subscriptions.map(sub => Name: ${sub.name}, Cost: ₹${sub.cost.toFixed(2)}, Cycle: ${sub.cycle}).join('\n');
    const prompt = You are a financial advisor. Here is a list of a user's subscriptions and their total monthly cost. Generate a report that includes a summary of their spending, identifies their most expensive subscriptions, and offers 3 to 4 actionable, friendly tips on how to manage or reduce their subscription spending. Make the tone encouraging and helpful. The subscriptions are:\n\n${subscriptionsText}\n\nTotal monthly cost: ₹${totalMonthlyCost.toFixed(2)}\nTotal yearly cost: ₹${totalYearlyCost.toFixed(2)};

    try {
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      const apiKey = ""; 
      const apiUrl = https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey};

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(HTTP error! status: ${response.status});
      }

      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setGeminiResponse(text);
      } else {
        throw new Error('No text returned from Gemini API.');
      }
    } catch (err) {
      console.error("Error calling Gemini API:", err);
      setError("Failed to generate report. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-lime-950 p-4 md:p-8 flex flex-col items-center font-sans text-lime-50">
      <div className="w-full max-w-4xl text-center mb-6">
        <h1 className="text-4xl font-extrabold text-lime-50 mb-2">Subtrack</h1>
        <p className="text-sm text-lime-200 truncate">Your User ID: {userId}</p>
      </div>

      <div className="w-full max-w-xl bg-lime-900 rounded-xl shadow-lg p-6 mb-8 text-center grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-semibold mb-2 text-lime-200">Total Monthly Cost</h2>
          <div className="text-4xl font-bold text-teal-400 flex items-center justify-center">
            <span className="text-3xl mr-1">₹</span>
            {totalMonthlyCost.toFixed(2)}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-semibold mb-2 text-lime-200">Total Yearly Cost</h2>
          <div className="text-4xl font-bold text-teal-400 flex items-center justify-center">
            <span className="text-3xl mr-1">₹</span>
            {totalYearlyCost.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="w-full max-w-xl bg-lime-900 rounded-xl shadow-lg p-6 mb-8">
        <form onSubmit={handleSubmit} className="mb-6 space-y-4">
          <h2 className="text-xl font-semibold text-lime-50">{editingId ? 'Edit Subscription' : 'Add New Subscription'}</h2>
          <input
            type="text"
            placeholder="Service Name (e.g., Netflix)"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="w-full p-3 border border-lime-800 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 bg-lime-950 text-lime-50 placeholder-lime-300"
          />
          <input
            type="number"
            placeholder="Cost (e.g., 500)"
            value={formCost}
            onChange={(e) => setFormCost(e.target.value)}
            className="w-full p-3 border border-lime-800 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 bg-lime-950 text-lime-50 placeholder-lime-300"
          />
          <select
            value={formCycle}
            onChange={(e) => setFormCycle(e.target.value)}
            className="w-full p-3 border border-lime-800 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 bg-lime-950 text-lime-50"
          >
            <option value="monthly" className="bg-lime-950">Monthly</option>
            <option value="yearly" className="bg-lime-950">Yearly</option>
          </select>
          <button
            type="submit"
            className="w-full bg-teal-600 text-white font-bold py-3 rounded-md shadow-md hover:bg-teal-700 transition duration-300"
            disabled={loading}
          >
            {loading ? 'Saving...' : editingId ? 'Update Subscription' : 'Add Subscription'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setFormName('');
                setFormCost('');
                setFormCycle('monthly');
              }}
              className="w-full bg-lime-700 text-lime-50 font-bold py-3 rounded-md shadow-md hover:bg-lime-800 transition duration-300 mt-2"
            >
              Cancel
            </button>
          )}
        </form>

        <h2 className="text-xl font-semibold text-lime-50 mb-4">My Subscriptions</h2>
        {subscriptions.length === 0 && !loading && (
          <div className="text-center text-lime-200 py-10">
            <p>No subscriptions added yet. Add your first one to get started!</p>
          </div>
        )}

        <ul className="space-y-4">
          {subscriptions.map(sub => (
            <li
              key={sub.id}
              className="bg-lime-800 p-4 rounded-md shadow-sm flex justify-between items-center text-lime-50"
            >
              <div>
                <h3 className="text-lg font-semibold">{sub.name}</h3>
                <p className="text-sm text-lime-200">₹{sub.cost.toFixed(2)} / {sub.cycle}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => startEdit(sub)}
                  className="p-2 rounded-full text-teal-400 hover:bg-lime-700 transition duration-300"
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={() => handleDelete(sub.id)}
                  className="p-2 rounded-full text-red-400 hover:bg-lime-700 transition duration-300"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Gemini Report Section */}
      {subscriptions.length > 0 && (
        <div className="w-full max-w-xl bg-lime-900 rounded-xl shadow-lg p-6 mb-8 text-center">
          <h2 className="text-xl font-semibold mb-4 text-lime-50">Gemini Report</h2>
          <p className="mb-4 text-lime-200">
            Get a personalized summary of your spending and tips to save money.
          </p>
          <button
            onClick={generateGeminiReport}
            disabled={loading}
            className="w-full bg-teal-600 text-white font-bold py-3 px-6 rounded-md shadow-md hover:bg-teal-700 transition duration-300 flex items-center justify-center mx-auto"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Get Gemini Report
          </button>
          {geminiResponse && (
            <div className="mt-6 text-left p-4 bg-lime-800 rounded-md">
              <p className="text-lime-100 whitespace-pre-wrap">{geminiResponse}</p>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-teal-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-lime-200">
            {geminiResponse ? 'Generating a new report...' : 'Loading...'}
          </span>
        </div>
      )}

      {error && <div className="text-red-400 text-center">{error}</div>}
      {message && <div className="text-green-400 text-center">{message}</div>}
    </div>
  );
};

export default App;