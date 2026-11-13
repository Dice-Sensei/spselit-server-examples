vcl 4.1;

# Example 2, layer 1: Varnish, a cache built for speed. It sits in front of HAProxy.
backend default {
  .host = "ha2-haproxy";
  .port = "8080";
}

sub vcl_recv {
  # Answer the live page's "are you alive?" question ourselves.
  if (req.url == "/front-health") {
    return (synth(200, "ok"));
  }
}

sub vcl_backend_response {
  # Remember good answers for 10 seconds (the back servers do not say how long themselves).
  if (beresp.status == 200) {
    set beresp.ttl = 10s;
  }
}

sub vcl_deliver {
  # Make the cache visible: HIT = answered from memory, MISS = had to ask HAProxy.
  if (obj.hits > 0) {
    set resp.http.X-Cache = "HIT";
  } else {
    set resp.http.X-Cache = "MISS";
  }
}
