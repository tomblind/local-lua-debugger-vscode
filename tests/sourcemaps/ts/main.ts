import {Sub} from "./sub/sub";

const name$test = {
    $foo: {
        bar$: {
            b_$_z(this: void, a: string, b: string) { return {__$$: a + b} }
        }
    }
};

function printFoobar(this: any) {
    const foobar = Sub.foobar();
    console.log(foobar);
    console.log(name$test);
    const $_$ = "FOO";
    console.log(name$test.$foo.bar$.b_$_z($_$, 'BAR').__$$);
    console.log(name$test["$foo"]["bar$"]["b_$_z"]($_$, 'BAR')["__$$"]);
    console.log(name$test["$foo"].bar$["b_$_z"]($_$, 'BAR').__$$);
}

printFoobar();
