const fs = require('fs');
const content = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf-8');
const search = `
        // Reset cart and notes
        onClearCart?.();
        setOrderNotes("");
      } else {
        console.error("[OrderFlow] Error submitting AI order:", res.error);
`;
const replace = `
        // Reset cart and notes
        onClearCart?.();
        setOrderNotes("");
        return { success: true, message: "Order successfully submitted to the kitchen." };
      } else {
        console.error("[OrderFlow] Error submitting AI order:", res.error);
`;
if (content.includes(search)) {
  fs.writeFileSync('src/components/AiWaiterChat.tsx', content.replace(search, replace));
  console.log("Patched 1");
}

const search2 = `
    } finally {
      setIsSubmittingOrder(false);
      setIsReviewOpen(false);
    }
  };
`;
const replace2 = `
    } finally {
      setIsSubmittingOrder(false);
      setIsReviewOpen(false);
    }
    return { success: false, error: "Failed to submit order." };
  };
`;
if (content.includes(search2)) {
  fs.writeFileSync('src/components/AiWaiterChat.tsx', fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf-8').replace(search2, replace2));
  console.log("Patched 2");
}

const search3 = `    liveVoiceRef.current?.updateActiveOrderState(updatedCart, orderNotes);
  };

  useEffect(() => {`;

const replace3 = `    liveVoiceRef.current?.updateActiveOrderState(updatedCart, orderNotes);
    return updatedCart;
  };

  useEffect(() => {`;
if (content.includes(search3)) {
  fs.writeFileSync('src/components/AiWaiterChat.tsx', fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf-8').replace(search3, replace3));
  console.log("Patched 3");
}
